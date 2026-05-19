const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../config/firebase');

// Supported provider structures for Billstack v1
const SUPPORTED_BANKS = ["PALMPAY", "9PSB", "SAFEHAVEN", "BANKLY", "PROVIDUS"];

router.post('/fund', async (req, res) => {
    const { uid, email, first_name, last_name, phone } = req.body;

    if (!uid || !email || !first_name || !last_name || !phone) {
        return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    try {
        const userRef = db.ref(`users/${uid}`);
        const snap = await userRef.once('value');
        const userData = snap.val();

        // 1. UPDATED SAFETY CHECK: 
        // Only bypass if the multiple accounts node already exists. 
        // This forces old users with only 1 bank stored to automatically generate the remaining banks.
        if (userData?.virtual_accounts) {
            console.log(`ℹ️ Multiple virtual accounts already exist in Firebase for UID: ${uid}. Returning saved data.`);
            const savedAccounts = Object.values(userData.virtual_accounts);
            return res.json({ 
                success: true, 
                account: userData,
                primaryAccount: savedAccounts[0],
                allAccounts: savedAccounts
            });
        }

        console.log(`\n🔄 Starting account creation/sync for UID: ${uid} - All banks mode`);

        const successfulAccounts = [];
        const errors = [];

        // 2. NAME FORMATTING: (LastName + first 2 letters of FirstName)
        const formattedLastName = last_name.trim();
        const formattedFirstName = first_name.trim().substring(0, 2);
        const combinedAccountName = `${formattedLastName} ${formattedFirstName}`.trim();

        for (const bank of SUPPORTED_BANKS) {
            try {
                // 3. JAVASCRIPT TEMPLATE LITERAL SYNTAX FIX
                const uniqueReference = `VA_${uid}_${bank}_${Date.now()}`;

                console.log(`Trying ${bank} with ref: ${uniqueReference}`);

                const payload = {
                    email: email.trim().toLowerCase(),
                    reference: uniqueReference,
                    firstName: formattedFirstName,
                    lastName: formattedLastName,
                    phone: phone.trim().replace(/\D/g, ''),
                    bank: bank,
                    currency: "NGN"
                };

                // 4. API PRODUCTION ENDPOINT (Billstack v1 Reserved Accounts)
                const response = await axios.post(
                    'https://api.billstack.co/v1/reserved-accounts',
                    payload,
                    {
                        headers: {
                            Authorization: `Bearer ${process.env.BILLSTACK_SECRET_KEY}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: 25000
                    }
                );

                console.log(`📥 Response from ${bank}:`, JSON.stringify(response.data, null, 2));

                const resData = response.data;
                const accountData = resData.data || resData;

                // Match response schema structure securely
                if ((resData.status === true || resData.success === true) && (accountData?.account_number || accountData?.accountNumber)) {
                    const newAccount = {
                        bank_name: accountData.bank_name || accountData.bank?.name || `${bank} Bank`,
                        account_number: accountData.account_number || accountData.accountNumber,
                        account_name: accountData.account_name || accountData.accountName || combinedAccountName,
                        bank_code: bank
                    };
                    successfulAccounts.push(newAccount);
                    console.log(`✅ SUCCESS with ${bank}`);
                } else {
                    const failMsg = resData.message || "Failed to generate account";
                    console.log(`⚠️ ${bank} failed: ${failMsg}`);
                    errors.push({ bank, error: failMsg });
                }

            } catch (bankError) {
                const errDetail = bankError.response?.data || bankError.message;
                errors.push({ bank, error: errDetail });
                console.error(`❌ ${bank} Error:`, errDetail);
            }
        }

        // 5. Handle complete failure case
        if (successfulAccounts.length === 0) {
            console.error("All banks failed", errors);
            return res.status(500).json({
                success: false,
                error: "Could not create any virtual account at the moment.",
                details: errors
            });
        }

        // 6. Select Primary Account (The first successful one dynamically generated)
        const primaryAccount = successfulAccounts[0];

        // 7. Structure the array into an indexed map object compatible with Firebase RTDB children
        const virtualAccountsObject = {};
        successfulAccounts.forEach((acc, index) => {
            virtualAccountsObject[`account_${index}`] = acc;
        });

        // 8. AUTOMATIC DATABASE UPDATE/SAVE
        // Keeps old fields intact for backwards compatibility while introducing the multi-account node
        await userRef.update({
            bank_name: primaryAccount.bank_name,
            account_number: primaryAccount.account_number,
            account_name: primaryAccount.account_name,
            bank_code: primaryAccount.bank_code,
            email: email.trim().toLowerCase(),
            balance: userData?.balance || 0,
            virtual_accounts: virtualAccountsObject, // This node safely nests all generated banks
            updatedAt: Date.now()
        });

        console.log(`✅ Database structure updated successfully with ${successfulAccounts.length} accounts.`);

        // 9. Send structured response payload to front-end
        res.json({
            success: true,
            message: `Successfully created ${successfulAccounts.length} account(s)`,
            primaryAccount: primaryAccount,
            allAccounts: successfulAccounts 
        });

    } catch (err) {
        console.error("Critical Error in /fund endpoint:", err.message);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
});

module.exports = router;
