const DnezerPopup = {
    init() {
        if (document.getElementById('popup-wrap')) return;
        const style = `<style>
            #popup-wrap { display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); z-index:10000; align-items:center; justify-content:center; font-family: sans-serif; }
            .popup-box { background:white; width:88%; max-width:320px; padding:25px; border-radius:20px; text-align:center; box-shadow:0 10px 30px rgba(0,0,0,0.4); border: 1px solid #eee; }
            .popup-btn { flex:1; padding:14px; border:none; border-radius:12px; font-weight:bold; cursor:pointer; font-size: 14px; }
            .p-input { width:100%; padding:15px; font-size:24px; text-align:center; letter-spacing:10px; border:2px solid #f0f0f0; border-radius:12px; margin-bottom:20px; outline:none; background: #fafafa; }
        </style>`;
        const html = `<div id="popup-wrap"><div class="popup-box" id="popup-box">
            <div id="p-icon" style="font-size:45px; margin-bottom:10px;"></div>
            <h3 id="p-title" style="margin:0; color:#0d47a1;"></h3>
            <p id="p-msg" style="color:#666; font-size:13px; margin:10px 0 20px 0;"></p>
            <div id="p-input-area"></div>
            <div style="display:flex; gap:10px;" id="p-btns"></div>
        </div></div>`;
        document.body.insertAdjacentHTML('beforeend', style + html);
    },
    alert(title, msg, type = 'info') {
        this.init();
        const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : '🔔';
        this.render(icon, title, msg, [{ text: 'OK', color: '#0d47a1', textColor: 'white' }]);
    },
    promptPin(callback) {
        this.init();
        this.render('🛡️', 'Secure Authorization', 'Enter your 4-digit PIN.', [
            { text: 'CANCEL', color: '#f5f5f5', textColor: '#666' },
            { text: 'VERIFY', color: '#0d47a1', textColor: 'white', isAction: true }
        ], true, callback);
    },
    render(icon, title, msg, buttons, isPin = false, callback = null) {
        const wrap = document.getElementById('popup-wrap');
        document.getElementById('p-icon').innerText = icon;
        document.getElementById('p-title').innerText = title;
        document.getElementById('p-msg').innerText = msg;
        const inputArea = document.getElementById('p-input-area');
        inputArea.innerHTML = isPin ? '<input type="password" id="p-pin" maxlength="4" inputmode="numeric" class="p-input" autofocus>' : '';
        const btnArea = document.getElementById('p-btns');
        btnArea.innerHTML = '';
        buttons.forEach(b => {
            const btn = document.createElement('button');
            btn.className = 'popup-btn';
            btn.innerText = b.text;
            btn.style.background = b.color;
            btn.style.color = b.textColor;
            btn.onclick = () => {
                if (b.isAction && isPin) {
                    const val = document.getElementById('p-pin').value;
                    wrap.style.display = 'none';
                    if (callback) callback(val);
                } else { wrap.style.display = 'none'; }
            };
            btnArea.appendChild(btn);
        });
        wrap.style.display = 'flex';
        if(isPin) setTimeout(() => document.getElementById('p-pin').focus(), 100);
    }
};
