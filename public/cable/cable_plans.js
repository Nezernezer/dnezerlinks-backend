const cablePlans = [
    { id: 1, provider: "GOTV", vtu_id: 1, name: "GOtv Smallie - monthly", base: 1900 },
    { id: 2, provider: "GOTV", vtu_id: 2, name: "GOtv Jinja", base: 3900 },
    { id: 3, provider: "GOTV", vtu_id: 3, name: "GOtv Jolli", base: 5800 },
    { id: 4, provider: "GOTV", vtu_id: 4, name: "GOtv Max", base: 8500 },
    { id: 5, provider: "GOTV", vtu_id: 5, name: "GOtv Supa - monthly", base: 11400 },
    { id: 84, provider: "GOTV", vtu_id: 84, name: "GOtv Supa Plus - monthly", base: 16800 },
    { id: 6, provider: "DSTV", vtu_id: 6, name: "DStv Padi", base: 4400 },
    { id: 7, provider: "DSTV", vtu_id: 7, name: "DStv Yanga", base: 6000 },
    { id: 8, provider: "DSTV", vtu_id: 8, name: "DStv Confam", base: 11000 },
    { id: 9, provider: "DSTV", vtu_id: 9, name: "DStv Compact", base: 19000 },
    { id: 13, provider: "STARTIMES", vtu_id: 13, name: "Nova (Dish) - 1 Month", base: 2100 },
    { id: 14, provider: "STARTIMES", vtu_id: 14, name: "Basic (Antenna) - 1 Month", base: 4000 },
    { id: 115, provider: "SHOWMAX", vtu_id: 115, name: "Showmax Full", base: 3500 }
];

const providerMap = { "GOTV": 1, "DSTV": 2, "STARTIMES": 3, "SHOWMAX": 4 };

const providerSelect = document.getElementById('provider');
const planSelect = document.getElementById('planList');
const iucInput = document.getElementById('iuc');
const customerInfo = document.getElementById('customerInfo');
const pinInput = document.getElementById('pin');
const statusBox = document.getElementById('statusBox');
const totalVal = document.getElementById('totalVal');
const priceDisplay = document.getElementById('priceDisplay');

function showMessage(text, type = 'error') {
    if(!statusBox) return;
    statusBox.textContent = text;
    statusBox.style.display = 'block';
    statusBox.style.backgroundColor = type === 'success' ? '#d4edda' : '#f8d7da';
    statusBox.style.color = type === 'success' ? '#155724' : '#721c24';
    setTimeout(() => { statusBox.style.display = 'none'; }, 5000);
}

// ==================== IMPROVED IUC VALIDATION (DEBOUNCED) ====================
let iucValidationTimeout = null;

iucInput.addEventListener('input', function() {
    const rawIuc = this.value.trim();
    const iuc = rawIuc.replace(/\s/g, "");
    const provider = providerSelect.value;

    if (iucValidationTimeout) clearTimeout(iucValidationTimeout);

    if (iuc.length < 9 || !provider) {
        customerInfo.textContent = "";
        customerInfo.style.color = "";
        return;
    }

    customerInfo.style.color = "#888";
    customerInfo.textContent = "Verifying...";

    iucValidationTimeout = setTimeout(async () => {
        try {
            const res = await fetch('https://dnezerlinks-backend.onrender.com/api/cabletv/validate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ iuc: iuc, providerID: providerMap[provider] })
            });

            const data = await res.json();
            if (data.success && data.customerName) {
                customerInfo.style.color = "#28a745";
                customerInfo.textContent = `✔ ${data.customerName}`;
            } else {
                customerInfo.style.color = "#dc3545";
                customerInfo.textContent = "✖ IUC/Smartcard number is not valid";
            }
        } catch (e) {
            customerInfo.style.color = "#dc3545";
            customerInfo.textContent = "✖ Verification failed. Check network.";
        }
    }, 600);
});

// ==================== PURCHASE LOGIC ====================
document.getElementById('cableForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const planValue = planSelect.value;
        const uid = localStorage.getItem('uid') || localStorage.getItem('userEmail');
        const selectedProvider = providerSelect.value;

        if(!planValue || !uid || !selectedProvider) return showMessage("All fields are required");
        if(customerInfo.textContent.includes("✖")) return showMessage("Invalid IUC number");

        const parsedPlan = JSON.parse(planValue);
        const payload = {
            uid,
            providerID: providerMap[selectedProvider],
            planDetails: parsedPlan,
            iuc: iucInput.value.trim(),
            pin: Number(pinInput.value)
        };

        showMessage("Processing Subscription...", "success");

        const res = await fetch('https://dnezerlinks-backend.onrender.com/api/cabletv/buy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (data.success) {
            showMessage("Subscription Successful!", "success");
            setTimeout(() => { window.location.reload(); }, 3000);
        } else {
            if (data.error === "KYC_REQUIRED") window.location.href = "../kyc_status.html";
            else if (data.error === "PIN_REQUIRED") window.location.href = "../pinsetup.html";
            else showMessage(data.error || "Transaction Failed");
        }
    } catch (err) {
        showMessage("Connection Error");
    }
});

providerSelect.addEventListener('change', () => {
    const prov = providerSelect.value;
    planSelect.innerHTML = '<option value="">-- Select Package --</option>';
    customerInfo.textContent = "";
    if (prov) {
        cablePlans.filter(p => p.provider === prov).forEach(p => {
            const total = p.base + (p.base < 5000 ? 500 : p.base < 15000 ? 800 : p.base < 30000 ? 1300 : 2200);
            const opt = document.createElement('option');
            opt.value = JSON.stringify({ vtu_id: p.vtu_id, total: total, name: p.name, base: p.base });
            opt.textContent = `${p.name} - ₦${total.toLocaleString()}`;
            planSelect.appendChild(opt);
        });
    }
});

planSelect.addEventListener('change', function() {
    if (this.value) {
        try {
            const data = JSON.parse(this.value);
            totalVal.textContent = `₦${data.total.toLocaleString()}`;
            priceDisplay.style.display = 'block';
        } catch(e) { priceDisplay.style.display = 'none'; }
    } else { priceDisplay.style.display = 'none'; }
});

document.getElementById('showPin').addEventListener('change', function() {
    pinInput.style.webkitTextSecurity = this.checked ? "none" : "disc";
});
