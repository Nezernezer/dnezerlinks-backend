(function () {
    const backendDomain = "https://dnezerlinks-backend.onrender.com";

    firebase.auth().onAuthStateChanged(async (user) => {
        if (!user) {
            window.location.href = '../login.html';
            return;
        }

        try {
            const idToken = await user.getIdToken(true);

            // Calls your newly deployed route protected by Render's environment variable
            const response = await fetch(`${backendDomain}/api/admin/verify-status`, {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + idToken
                }
            });

            const data = await response.json();

            if (!response.ok || !data.isAdmin) {
                alert("Access Denied: You do not possess the required administrator rights.");
                window.location.href = '../home.html';
            } else {
                console.log("Admin credentials verified via Render successfully.");
                // Makes the layout visible once security clears the connection passes
                document.body.style.display = "block"; 
            }
        } catch (error) {
            console.error("Auth security gate handshake dropped:", error);
            alert("Security connection validation dropped. Returning to safety.");
            window.location.href = '../home.html';
        }
    });
})();
