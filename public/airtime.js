async function processAirtime(phone, amount, serviceID) {
    const d = new Date();
    const requestId = d.getFullYear().toString() + 
                      (d.getMonth() + 1).toString().padStart(2, '0') + 
                      d.getDate().toString().padStart(2, '0') + 
                      d.getHours().toString().padStart(2, '0') + 
                      d.getMinutes().toString().padStart(2, '0') + 
                      Math.floor(Math.random() * 1000);

    try {
        const response = await fetch("https://sandbox.vtpass.com/api/pay", {
            method: 'POST',
            headers: {
                'api-key': "fe3b5e2e6969bf4badd5e4d23be8a4a9",      //
                'public-key': "PK_342391fe5e421b2c6072540a73464a5916c51cf603d",
                'secret-key': "SK_64382665db8002e57515f56d7e967a702d729556046",
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                request_id: requestId,
                serviceID: serviceID,
                amount: amount,
                phone: phone
            })
        });
        
        const data = await response.json();
        if (data.code === "000") {
            alert("Success! Airtime sent to " + phone);
        } else {
            alert("Error: " + data.response_description);
        }
    } catch (error) {
        console.error("Connection Failed", error);
    }
}
