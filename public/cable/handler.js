let lookupTimeout;
let isIucVerified = false;

function populatePlans() {
    const providerId = document.getElementById("provider").value;
    const planList = document.getElementById("planList");
    planList.innerHTML = '<option value="">-- Choose Package --</option>';
    document.getElementById("priceDisplay").style.display = "none";
    isIucVerified = false;
    if (document.getElementById("customerInfo")) {
        document.getElementById("customerInfo").innerText = "";
    }

    if (providerId && typeof localPlans !== 'undefined' && localPlans[providerId]) {
        localPlans[providerId].forEach(plan => {
            let opt = document.createElement("option");
            opt.value = plan.id;
            opt.textContent = plan.name;
            opt.dataset.price = plan.price;
            planList.appendChild(opt);
        });
    }
}

function updatePriceDisplay() {
    const planList = document.getElementById("planList");
    const selected = planList.options[planList.selectedIndex];
    if (selected && selected.dataset.price) {
        document.getElementById("priceDisplay").style.display = "block";
        document.getElementById("totalVal").innerText = "₦" + parseFloat(selected.dataset.price).toLocaleString();
    }
}

async function autoLookupCustomer() {
    const iuc = document.getElementById("iuc").value.trim();
    const provider = document.getElementById("provider").value;
    const infoDiv = document.getElementById("customerInfo");
    if (iuc.length < 8) { infoDiv.innerText = ""; isIucVerified = false; return; }

    if (lookupTimeout) clearTimeout(lookupTimeout);
    infoDiv.style.color = "orange";
    infoDiv.innerText = "Verifying...";

    lookupTimeout = setTimeout(async () => {
        try {
            const res = await fetch("https://dnezerlinks-backend.onrender.com/api/cabletv/validate", {
                 method: "POST",
                 headers: { "Content-Type": "application/json" },
                 body: JSON.stringify({ iuc, providerID: provider })
            });
            const data = await res.json();
            if (data.success) {
                infoDiv.style.color = "green";
                infoDiv.innerText = "✅ " + data.customerName;
                isIucVerified = true;
            } else {
                infoDiv.style.color = "red";
                infoDiv.innerText = "❌ Invalid IUC";
                isIucVerified = false;
            }
        } catch (e) { 
            console.error("Verify Error:", e); 
            infoDiv.innerText = "Network Error";
        }
    }, 1200);
}

function validateUserAndOpenModal() {
    if (!isIucVerified) return showMessage("Please verify IUC number first", true);
    document.getElementById("pinModal").style.display = "flex";
}

function closePinModal() {
    document.getElementById("pinModal").style.display = "none";
    document.getElementById("txnPin").value = "";
    document.getElementById("confirmBtn").disabled = false;
    document.getElementById("confirmBtn").innerText = "Confirm Payment";
}

async function verifyAndPay() {
    const btn = document.getElementById("confirmBtn");
    const pinError = document.getElementById("pinError");
    const pin = document.getElementById("txnPin").value;

    try {
        if (pin.length !== 4) {
            pinError.innerText = "Enter 4-digit PIN";
            return;
        }

        btn.disabled = true;
        btn.innerText = "Connecting...";

        const user = firebase.auth().currentUser;
        if (!user) {
            btn.disabled = false;
            btn.innerText = "Confirm Payment";
            alert("Your session has expired. Please login again.");
            return;
        }

        const planList = document.getElementById("planList");
        const selected = planList.options[planList.selectedIndex];

        const payload = {
            pin: String(pin),
            uid: user.uid,
            iuc: document.getElementById("iuc").value.trim(),
            providerID: document.getElementById("provider").value,
            planID: selected.value,
            amount: parseFloat(selected.dataset.price)
        };

        // Log locally in Eruda console
        console.log("System: Sending Payment Payload", payload);

        const response = await fetch("https://dnezerlinks-backend.onrender.com/api/cabletv/pay", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const res = await response.json();

        if (res.success) {
            closePinModal();
            showMessage("✅ Subscription Successful!", false);
            setTimeout(() => { window.location.href = "../home.html"; }, 2000);
        } else {
            btn.disabled = false;
            btn.innerText = "Confirm Payment";
            pinError.innerText = res.error || "Transaction Failed";
        }

    } catch (error) {
        console.error("CRITICAL ERROR:", error.message);
        btn.disabled = false;
        btn.innerText = "Confirm Payment";
        pinError.innerText = "System Error.";
    }
}

function showMessage(msg, isError) {
    const div = document.getElementById("statusMsg");
    div.innerText = msg;
    div.className = isError ? "error-msg" : "success-msg";
    div.style.display = "block";
    window.scrollTo({top: 0, behavior: 'smooth'});
    setTimeout(() => { div.style.display = "none"; }, 5000);
}

function togglePinVisibility() {
    const p = document.getElementById("txnPin");
    p.type = p.type === "password" ? "text" : "password";
}
