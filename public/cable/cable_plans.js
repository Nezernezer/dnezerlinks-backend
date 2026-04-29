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

function getProfit(base) {
    if (base < 5000) return 500;
    if (base < 15000) return 800;
    if (base < 30000) return 1300;
    return 2200;
}

const allPlans = cablePlans.map(p => ({ ...p, total: p.base + getProfit(p.base) }));

const providerSelect = document.getElementById('provider');
const planSelect = document.getElementById('planList');
const pinInput = document.getElementById('pin');
const showPin = document.getElementById('showPin');
const priceDisplay = document.getElementById('priceDisplay');
const totalVal = document.getElementById('totalVal');

const providerMap = { "GOTV": 1, "DSTV": 2, "STARTIMES": 3, "SHOWMAX": 4 };

// 1. Toggle Logic
if (showPin) {
    showPin.addEventListener('change', function() {
        pinInput.style.webkitTextSecurity = this.checked ? "none" : "disc";
    });
}

// 2. Populate Plans
providerSelect.addEventListener('change', function() {
    const prov = this.value;
    planSelect.innerHTML = '<option value="">-- Select Package --</option>';
    if (prov) {
        const filtered = allPlans.filter(p => p.provider === prov);
        filtered.forEach(p => {
            const opt = document.createElement('option');
            opt.value = JSON.stringify({ vtu_id: p.vtu_id, total: p.total, name: p.name, base: p.base });
            opt.textContent = `${p.name} - ₦${p.total.toLocaleString()}`;
            planSelect.appendChild(opt);
        });
    }
});

// 3. Price Display
planSelect.addEventListener('change', function() {
    if (this.value) {
        const data = JSON.parse(this.value);
        totalVal.textContent = `₦${data.total.toLocaleString()}`;
        priceDisplay.style.display = 'block';
    } else {
        priceDisplay.style.display = 'none';
    }
});

// 4. Validation Logic
document.getElementById('validateBtn').addEventListener('click', async () => {
    const iuc = document.getElementById('iuc').value;
    const provider = document.getElementById('provider').value;
    if(!iuc || !provider) return alert("Enter IUC and Provider");
    
    try {
        const res = await fetch('https://dnezerlinks-backend.onrender.com/api/cabletv/validate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ iuc, providerID: providerMap[provider] })
        });
        const data = await res.json();
        if(data.success) alert("Customer: " + data.customerName);
        else alert(data.error);
    } catch (e) { alert("Server Connection Error"); }
});

// 5. Purchase Logic
document.getElementById('cableForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const planValue = planSelect.value;
    const uid = localStorage.getItem('uid') || localStorage.getItem('userId') || localStorage.getItem('user_id');
    if(!planValue || !uid) return alert("Missing plan or user ID");

    const payload = {
        uid,
        providerID: providerMap[providerSelect.value],
        planDetails: JSON.parse(planValue),
        iuc: document.getElementById('iuc').value,
        pin: pinInput.value
    };

    try {
        const res = await fetch('https://dnezerlinks-backend.onrender.com/api/cabletv/buy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) { alert("Subscription Successful!"); window.location.reload(); }
        else { alert("Error: " + data.error); }
    } catch (err) { alert("Network Error"); }
});
