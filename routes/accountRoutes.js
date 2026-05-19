const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../config/firebase');

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

        // 1. SMART CHECK: Skip API loop only if they already have multiple accounts saved
        if (userData?.virtual_accounts) {
            console.log(`ℹ️ Virtual accounts node already exists for UID: ${uid}`);
            const savedAccounts = Object.values(userData.virtual_accounts);
            return res.json({ 
                success: true, 
                account: userData,
                primaryAccount: savedAccounts[0],
                allAccounts: savedAccounts
            });
        }

        console.log(`\n🔄 Starting account creation for UID: ${uid} - All banks mode`);

        const successfulAccounts = [];
        const errors = [];

        // 2. NAME FIX: LastName + first 2 letters of FirstName
        const formattedLastName = last_name.trim();
        const formattedFirstName = first_name.trim().substring(0, 2);
        const combinedAccountName = `${formattedLastName} ${formattedFirstName}`.trim();

        for (const bank of SUPPORTED_BANKS) {
            try {
                // 3. SYNTAX FIX: Cleaned up JavaScript template literal string formatting
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

                // 4. ENDPOINT URL FIX: Removed trailing slash to prevent LiteSpeed 404 HTML errors
                const response = await axios.post(
                    'https://api.billstack.co/v2/thirdparty/generateVirtualAccount',
                    payload,
                    {
                        headers: {
                            Authorization: `Bearer ${process.env.BILLSTACK_SECRET_KEY}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: 30000
                    }
                );

                console.log(`📥 Response from ${bank}:`, JSON.stringify(response.data, null, 2));

                const resData = response.data;
                const accountData = resData.data || resData;

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
                console.error(`❌ ${bank} failed:`, errDetail);
            }
        }

        if (successfulAccounts.length === 0) {
            console.error("All banks failed to generate", errors);
            return res.status(500).json({
                success: false,
                error: "Could not create any virtual accounts. Service may be down.",
                details: errors
            });
        }

        const primary = successfulAccounts[0];

        // 5. STRUCTURE ACCOUNTS FOR FIREBASE: Map array items into indexed children keys
        const virtualAccountsObject = {};
        successfulAccounts.forEach((acc, index) => {
            virtualAccountsObject[`account_${index}`] = acc;
        });

        // 6. DB STORAGE UPDATE: Persist flat primary variables alongside the multiple account node
        await userRef.update({
            bank_name: primary.bank_name,
            account_number: primary.account_number,
            account_name: primary.account_name,
            bank_code: primary.bank_code,
            email: email.trim().toLowerCase(),
            balance: userData?.balance || 0,
            virtual_accounts: virtualAccountsObject, 
            updatedAt: Date.now()
        });

        console.log(`✅ Database records updated automatically with ${successfulAccounts.length} virtual accounts.`);

        res.json({
            success: true,
            message: `Created ${successfulAccounts.length} account(s)`,
            primaryAccount: primary,
            allAccounts: successfulAccounts
        });

    } catch (err) {
        console.error("Critical Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
