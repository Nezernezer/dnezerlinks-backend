(function () {
    const backendDomain = "https://dnezerlinks-backend.onrender.com";

    document.addEventListener("DOMContentLoaded", () => {
        if (document.body && document.body.id !== "loadingOverlay") {
            // Keep hidden until verified if not using the loading screen wrapper
            if(window.getComputedStyle(document.body).display !== "block" && !document.getElementById('loadingOverlay')) {
                document.body.style.display = "none";
            }
        }
    });

    firebase.auth().onAuthStateChanged(async (user) => {
        if (!user) {
            window.location.href = '../login.html';
            return;
        }

        try {
            const idToken = await user.getIdToken(true);

            // 1. Verify master token authenticity with Render backend
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
                return;
            }

            // 2. Fetch granular permissions directly from the database node
            const rolesSnap = await firebase.database().ref(`admin_roles/${user.uid}`).once('value');
            const roles = rolesSnap.val() || {};

            // 3. Store roles globally so pages like users.html or wallet.html can check them instantly
            window.CurrentAdminRoles = roles;

            console.log("Admin credentials and dynamic role matrix verified successfully.");
            
            if (document.body) {
                document.body.style.display = "block";
            }
            
            // Dispatch event to kick off page synchronization
            window.dispatchEvent(new CustomEvent('admin-verified', { detail: roles }));

        } catch (error) {
            console.error("Auth security gate handshake dropped:", error);
            alert("Security connection validation dropped. Returning to safety.");
            window.location.href = '../home.html';
        }
    });
})();
