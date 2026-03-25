// 1. Data Plan Database (Common VTPass Variations)
const dataPlans = {
    mtn: [
        { name: "MTN SME 1GB - ₦290", code: "mtn-sme-1gb" },
        { name: "MTN SME 2GB - ₦580", code: "mtn-sme-2gb" },
        { name: "MTN SME 5GB - ₦1450", code: "mtn-sme-5gb" }
    ],
    glo: [
        { name: "Glo 1.35GB (Gift) - ₦450", code: "glo1000" },
        { name: "Glo 2.9GB (Gift) - ₦900", code: "glo2000" }
    ],
    airtel: [
        { name: "Airtel 1GB - ₦300", code: "airtel-sme-1gb" }
    ]
};

// 2. Function to update the dropdown list
function updatePlans() {
    const network = document.getElementById('network').value;
    const planSelect = document.getElementById('variation');
    
    planSelect.innerHTML = '<option value="">Select Plan</option>';
    
    if (dataPlans[network]) {
        dataPlans[network].forEach(plan => {
            let opt = document.createElement('option');
            opt.value = plan.code;
            opt.innerText = plan.name;
            planSelect.appendChild(opt);
        });
    }
}

// 3. The VTPass Purchase Engine
async function buyData() {
    const network = document.getElementById('network').value;
    const variation = document.getElementById('variation').value;
    const phone = document.getElementById('phone').value;
    const btn = document.getElementById('buyBtn');

    if(!network || !variation || !phone) return alert("Fill all fields");

    btn.disabled = true;
    btn.innerText = "Processing...";

    const reqId = Date.now().toString(); // Use the date logic from previous steps for live

    try {
        const res = await fetch("https://sandbox.vtpass.com/api/pay", {
            method: 'POST',
            headers: {
                'api-key': "fe3b5e2e6969bf4badd5e4d23be8a4a9",
                'public-key': "PK_342391fe5e421b2c6072540a73464a5916c51cf603d",
                'secret-key': "SK_64382665db8002e57515f56d7e967a702d729556046",
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                request_id: reqId,
                serviceID: network + "-data",
                variation_code: variation,
                phone: phone
            })
        });

        const data = await res.json();
        alert(data.code === "000" ? "Data Sent Successfully!" : "Error: " + data.response_description);
        
    } catch (e) {
        alert("Connection Error");
    } finally {
        btn.disabled = false;
        btn.innerText = "Subscribe Now";
    }
}
