const firebaseConfig = {
    apiKey: "AIzaSyAXWh3ls4yEANmGy4g7xZ8jlBN0KoFC5yc",
    authDomain: "dnezerlinks.firebaseapp.com",
    databaseURL: "https://dnezerlinks-default-rtdb.firebaseio.com",
    projectId: "dnezerlinks",
    appId: "1:1028450580168:web:d7a48462a128f02aa657fd"
};

if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
const database = firebase.database();
const auth = firebase.auth();

function showMessage(msg, isError = true) {
    const msgDiv = document.getElementById('statusMsg');
    msgDiv.textContent = msg;
    msgDiv.style.display = 'block';
    msgDiv.className = isError ? 'error-msg' : 'success-msg';
}

function closePinModal() { document.getElementById('pinModal').style.display = 'none'; }

function togglePinVisibility() {
    const pinInput = document.getElementById('txnPin');
    const toggleBtn = document.getElementById('toggleBtn');
    if (pinInput.type === "password") {
        pinInput.type = "text";
        toggleBtn.textContent = "Hide PIN";
    } else {
        pinInput.type = "password";
        toggleBtn.textContent = "Show PIN";
    }
}

function populatePlans() {
    const pId = document.getElementById('provider').value;
    const planList = document.getElementById('planList');
    planList.innerHTML = '<option value="">-- Select Package --</option>';
    
    if (typeof localPlans !== 'undefined' && localPlans[pId]) {
        localPlans[pId].forEach(plan => {
            const opt = document.createElement('option');
            opt.value = plan.id;
            opt.dataset.price = plan.price;
            opt.textContent = plan.name;
            planList.appendChild(opt);
        });
    }
}

function updatePriceDisplay() {
    const planList = document.getElementById('planList');
    const selected = planList.options[planList.selectedIndex];
    const display = document.getElementById('priceDisplay');
    if (planList.value && selected.dataset.price) {
        display.style.display = 'block';
        document.getElementById('totalVal').textContent = `₦${Number(selected.dataset.price).toLocaleString()}`;
    } else {
        display.style.display = 'none';
    }
}

let typingTimer;
function autoLookupCustomer() {
    clearTimeout(typingTimer);
    const iuc = document.getElementById('iuc').value.trim();
    const provider = document.getElementById('provider').value;
    const info = document.getElementById('customerInfo');

    if (iuc.length >= 8 && provider) {
        info.style.color = "#007bff";
        info.textContent = "Verifying...";
        typingTimer = setTimeout(async () => {
            try {
                const response = await fetch('https://dnezerlinks-backend.onrender.com/api/cabletv/validate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ iuc, providerID: provider })
                });
                const result = await response.json();
                if (result.success && result.customerName) {
                    info.style.color = "#2e7d32";
                    info.textContent = result.customerName;
                } else {
                    info.style.color = "#c62828";
                    info.textContent = "Invalid IUC Number";
                }
            } catch (err) { info.textContent = ""; }
        }, 800);
    }
}

async function validateUserAndOpenModal() {
    const user = auth.currentUser;
    const provider = document.getElementById('provider').value;
    const plan = document.getElementById('planList').value;
    const iuc = document.getElementById('iuc').value;
    const cName = document.getElementById('customerInfo').textContent.trim();
    const buyBtn = document.getElementById('buyBtn');

    if (!provider || !plan || !iuc) return showMessage("Please fill all fields.");
    if (!cName || cName === "Verifying..." || cName === "Invalid IUC Number") {
        return showMessage("Please verify IUC number first.");
    }

    buyBtn.disabled = true;
    buyBtn.innerText = "Checking status...";

    try {
        const snap = await database.ref('users/' + user.uid).once('value');
        const data = snap.val() || {};

        if ((data.kyc_status || "").toUpperCase() !== "VERIFIED") {
            window.location.href = "../kyc_status.html";
            return;
        }

        if (!data.transaction_pin) {
            window.location.href = "../pinsetup.html?return=cable";
            return;
        }

        document.getElementById('pinModal').style.display = 'flex';
        document.getElementById('txnPin').value = '';
        document.getElementById('pinError').textContent = '';

    } catch (e) {
        showMessage("Error validating account.");
    } finally {
        buyBtn.disabled = false;
        buyBtn.innerText = "Activate Subscription";
    }
}

async function verifyAndPay() {
    const enteredPin = document.getElementById('txnPin').value;
    const user = auth.currentUser;
    const btn = document.getElementById('confirmBtn');
    const pinErr = document.getElementById('pinError');

    if (enteredPin.length < 4) { pinErr.textContent = "Enter 4 digits"; return; }

    btn.disabled = true;
    btn.innerText = "Processing...";

    // PIN is passed to executePurchase which sends it to backend for verification
    executePurchase(user.uid, enteredPin);
}

async function executePurchase(uid, pin) {
    const provider = document.getElementById("provider").value;
    const planList = document.getElementById("planList");
    const selectedPlan = planList.options[planList.selectedIndex];
    const iuc = document.getElementById("iuc").value;
    const btn = document.getElementById('confirmBtn');

    try {
        const response = await fetch("https://dnezerlinks-backend.onrender.com/api/cabletv/pay", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                pin, 
                uid, 
                iuc, 
                providerID: provider, 
                cableplan: selectedPlan.value,
                amount: selectedPlan.dataset.price
            })
        });
        const res = await response.json();
        if (res.success) {
            closePinModal();
            showMessage("Subscription Successful!", false);
            setTimeout(() => { window.location.href = "../home.html"; }, 2000);
        } else {
            if (res.error && res.error.toLowerCase().includes("pin")) {
                document.getElementById('pinError').textContent = res.error;
                btn.disabled = false;
                btn.innerText = "Confirm Payment";
            } else {
                closePinModal();
                showMessage(res.error || "Transaction Failed");
                btn.disabled = false;
                btn.innerText = "Confirm Payment";
            }
        }
    } catch (e) {
        closePinModal();
        showMessage("Network Error.");
        btn.disabled = false;
        btn.innerText = "Confirm Payment";
    }
}
