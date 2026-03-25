async function buyAirtime() {
    const phone = document.getElementById('phone').value;
    const amount = document.getElementById('amount').value;
    const network = document.getElementById('network').value;

    if(!phone || !amount || !network) return alert("Please fill all fields");

    const res = await fetch("https://sandbox.vtpass.com/api/pay", {
        method: 'POST',
        headers: {
            'api-key': "fe3b5e2e6969bf4badd5e4d23be8a4a9",
            'public-key': "PK_342391fe5e421b2c6072540a73464a5916c51cf603d",
            'secret-key': "SK_64382665db8002e57515f56d7e967a702d729556046",
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            request_id: Date.now().toString(), 
            serviceID: network,
            amount: amount,
            phone: phone
        })
    });
    const result = await res.json();
    alert(result.code === "000" ? "Airtime Sent!" : "Error: " + result.response_description);
}


