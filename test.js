import 'dotenv/config';
import axios from 'axios';

// VTPass requires a Request ID starting with the current date: YYYYMMDDHHII
const getVtpId = () => {
    const d = new Date();
    const datePart = d.getFullYear().toString() + 
                     (d.getMonth() + 1).toString().padStart(2, '0') + 
                     d.getDate().toString().padStart(2, '0') + 
                     d.getHours().toString().padStart(2, '0') + 
                     d.getMinutes().toString().padStart(2, '0');
    return datePart + Math.floor(Math.random() * 10000);
};

async function runTest() {
    console.log("🚀 Initiating Sandbox Transaction...");
    
    const payload = {
        request_id: getVtpId(),
        serviceID: "mtn", 
        amount: 100,      
        phone: "08011111111" // Standard Sandbox number for success
    };

    try {
        const response = await axios.post(process.env.VTP_API_URL + "pay", payload, {
            headers: {
                'api-key': process.env.VTP_API_KEY,      // Static API Key
                'public-key': process.env.VTP_PUBLIC_KEY, // Public Key
                'secret-key': process.env.VTP_SECRET_KEY, // Secret Key
                'Content-Type': 'application/json'
            }
        });
        
        console.log("✅ API RESPONSE:");
        console.log(JSON.stringify(response.data, null, 2));

        if (response.data.code === "000") {
            console.log("\nSuccess! Your VTPass integration is now functional.");
        } else {
            console.log("\nError Code: " + response.data.code);
            console.log("Message: " + response.data.response_description);
        }
    } catch (error) {
        console.log("❌ CONNECTION FAILED:");
        if (error.response) {
            console.log(error.response.data);
        } else {
            console.log(error.message);
        }
    }
}

runTest();

