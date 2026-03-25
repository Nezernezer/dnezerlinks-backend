# 1. Add the Admin Button to home.html
sed -i '/<div class="header">/a <button id="adminBtn" style="display:none; position:absolute; top:10px; right:10px; background:white; color:#0d47a1; border:none; padding:5px 10px; border-radius:5px; font-weight:bold; cursor:pointer;" onclick="window.location.href='\''admin.html'\''">ADMIN PANEL</button>' ~/dnezerlinks/public/home.html

# 2. Add the Logic to show it (Replace UID below)
sed -i '/auth.onAuthStateChanged/a \    if(user && user.uid === "VCSNLSzYV2WsNG93mPE2ZtwdTna2") { document.getElementById("adminBtn").style.display = "block"; }' ~/dnezerlinks/public/home.html
