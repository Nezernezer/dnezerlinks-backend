    function renderTable() {
        const tbody = document.getElementById('userTable');
        tbody.innerHTML = "";
        let count = 0;

        Object.keys(allUsers).forEach(uid => {
            const u = allUsers[uid];
            // Filter logic
            let status = u.kyc_status || 'NOT-SUBMITTED';
            if(!u.matric_no && status !== 'VERIFIED') status = 'NOT-SUBMITTED';
            if(currentFilter !== 'ALL' && status !== currentFilter) return;
            
            count++;
            const isBlocked = u.account_status === 'BLOCKED';

            tbody.innerHTML += `
                <tr>
                    <td><b>${u.name || 'User'}</b></td>
                    <td>${u.email || '<i>No Email</i>'}<br><small>${u.phone || 'No Phone'}</small></td>
                    <td style="font-family:monospace; font-size:10px; color:#666;">${uid}</td>
                    <td><small>${u.matric_no ? `ID: ${u.matric_no}` : '---'}</small></td>
                    <td><span class="badge status-${status}">${status}</span></td>
                    <td>
                        <div class="btn-group">
                            <button class="action-btn btn-v" onclick="upStatus('${uid}','VERIFIED')">Verify</button>
                            <button class="action-btn btn-d" onclick="declineUser('${uid}')">Decline</button>
                            <button class="action-btn ${isBlocked ? 'btn-unblock' : 'btn-block'}" onclick="toggleBlock('${uid}',${isBlocked})">${isBlocked ? 'UNBLOCK' : 'BLOCK'}</button>
                        </div>
                    </td>
                </tr>
            `;
        });
        document.getElementById('userCount').innerText = "Total: " + count;
    }
