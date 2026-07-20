function renderTable() {
    const tbody = document.getElementById('userTable');
    tbody.innerHTML = "";
    let count = 0;

    // Pull the dynamic rules loaded into the parent window/page context
    const roles = window.currentAdminRoles || {};

    Object.keys(allUsers).forEach(uid => {
        const u = allUsers[uid];

        // Normalize fallback parameters and filters
        let status = u.kyc_status || 'NOT-SUBMITTED';
        if (!u.matric_no && status !== 'VERIFIED') status = 'NOT-SUBMITTED';
        if (currentFilter !== 'ALL' && status !== currentFilter) return;

        count++;

        // 1. SAFE CASE MATCHING: Ensure case parity with structural DB states ('blocked' vs 'BLOCKED')
        const isBlocked = u.account_status === 'blocked' || u.account_status === 'BLOCKED';

        // 2. SAFETY ESCAPING: Protect names containing special string layouts or quotes from breaking click handlers
        const safeName = (u.name || 'User').replace(/'/g, "\\'");

        // 3. PRIVILEGE MATRIX FILTERS: Conditionally generate interface actions
        let actionButtonsHtml = "";

        // Only show verification and deck controls if Master Admin or explicit KYC privilege is granted
        if (roles.isMaster || roles.canVerifyKyc) {
            actionButtonsHtml += `
                <button class="action-btn btn-v" onclick="upStatus('${uid}','VERIFIED')">Verify</button>
                <button class="action-btn btn-d" onclick="declineUser('${uid}')">Decline</button>
            `;
        }

        // Only show structural suspension triggers if the current operator is a Master Admin
        if (roles.isMaster) {
            actionButtonsHtml += `
                <button class="action-btn ${isBlocked ? 'btn-u' : 'btn-b'}" onclick="toggleBlock('${uid}', ${isBlocked}, '${safeName}')">
                    ${isBlocked ? 'UNBLOCK' : 'BLOCK'}
                </button>
            `;
        }

        tbody.innerHTML += `
            <tr>
                <td><b>${u.name || 'User'}</b></td>
                <td>${u.email || '<i>No Email</i>'}<br><small>${u.phone || 'No Phone'}</small></td>
                <td style="font-family:monospace; font-size:10px; color:#666;">${uid}</td>
                <td>
                    <small>${u.matric_no ? `ID: ${u.matric_no}` : '---'}</small>
                    ${u.id_type ? `<br><small style="color:#777;">${u.id_type}: ${u.id_number || 'N/A'}</small>` : ''}
                </td>
                <td><span class="badge status-${status}">${status}</span></td>
                <td>
                    <div class="btn-group">
                        ${actionButtonsHtml || '<small style="color:#64748b; font-style:italic;">🔒 Read-Only Mode</small>'}
                    </div>
                </td>
            </tr>
        `;
    });

    // 4. ELEMENT SYNC: Ensure consistency with your dashboard's status header target ID
    const countEl = document.getElementById('userCount') || document.getElementById('stats');
    if (countEl) {
        countEl.innerText = count + " Users Active";
    }
}
