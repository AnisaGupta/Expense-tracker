/**
 * ============================================================
 *  LocalBites — Login Page Interactions (login.js)
 * ============================================================
 */

'use strict';

document.addEventListener('DOMContentLoaded', () => {
    const page = document.body.dataset.page;
    if (page !== 'customer-login' && page !== 'business-login') return;

    const card = document.querySelector('.auth-card');
    
    // OTP Box interaction helper
    const setupOtpBoxes = (containerSelector) => {
        const wrap = document.querySelector(containerSelector);
        if (!wrap) return;
        const boxes = [...wrap.querySelectorAll('.otp-box')];
        boxes.forEach((box, i) => {
            box.addEventListener('input', () => {
                box.value = box.value.replace(/\D/g, '').slice(-1);
                box.classList.toggle('otp-filled', !!box.value);
                if (box.value && i < boxes.length - 1) boxes[i + 1].focus();
            });
            box.addEventListener('keydown', e => {
                if (e.key === 'Backspace' && !box.value && i > 0) {
                    boxes[i - 1].value = '';
                    boxes[i - 1].classList.remove('otp-filled');
                    boxes[i - 1].focus();
                }
            });
        });
    };

    // Countdown Timer Helper
    let timerInterval = null;
    const startTimer = (display, resendBtn) => {
        if (timerInterval) clearInterval(timerInterval);
        let s = 60;
        resendBtn.disabled = true;
        resendBtn.classList.remove('can-resend');
        display.classList.remove('urgent');

        const updateText = () => {
            const m = Math.floor(s / 60);
            const sec = s % 60;
            display.textContent = `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
            if (s <= 10 && s > 0) display.classList.add('urgent');
        };

        updateText();
        timerInterval = setInterval(() => {
            s--;
            updateText();
            if (s <= 0) {
                clearInterval(timerInterval);
                display.textContent = '00:00';
                display.classList.remove('urgent');
                resendBtn.disabled = false;
                resendBtn.classList.add('can-resend');
            }
        }, 1000);
    };

    // Send OTP Loading Overlay Simulation
    const showOverlay = (msg) => {
        let ov = card.querySelector('.send-overlay');
        if (!ov) {
            ov = document.createElement('div');
            ov.className = 'send-overlay';
            ov.innerHTML = `<div class="spinner"></div><p style="margin-top:var(--sp-3); font-weight:700;">${msg}</p>`;
            card.appendChild(ov);
        }
        ov.querySelector('p').textContent = msg;
        setTimeout(() => ov.classList.add('active'), 50);
    };

    const hideOverlay = () => {
        const ov = card.querySelector('.send-overlay');
        if (ov) ov.classList.remove('active');
    };

    // Reads the combined digits out of a set of OTP boxes, e.g. "482913"
    const readOtp = (containerSelector) =>
        [...document.querySelectorAll(`${containerSelector} .otp-box`)].map(b => b.value).join('');

    // Thin wrapper around the shared /auth/* endpoints used by both the
    // customer and business forgot-password flows.
    const authApi = (path, payload) =>
        fetch(`/auth/${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).then(res => res.json().then(data => ({ ok: res.ok, data })));

    /* ── CUSTOMER LOGIN FLOWS ── */
    if (page === 'customer-login') {
        const loginForm = document.getElementById('loginForm');
        loginForm?.addEventListener('submit', e => {
            e.preventDefault();
            if (!LB.validateForm(loginForm)) return;

            const btn = loginForm.querySelector('button[type="submit"]');
            const payload = {
                username: document.getElementById('loginUsername').value.trim(),
                password: document.getElementById('loginPassword').value
            };

            LB.setLoading(btn, true);
            fetch('/customer/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
                .then(res => res.json().then(data => ({ ok: res.ok, data })))
                .then(({ ok, data }) => {
                    LB.setLoading(btn, false);
                    if (!ok || !data.success) {
                        LB.toast(data.message || 'Invalid username or password.', 'error');
                        return;
                    }
                    LB.toast('Welcome back! Let\'s check location...', 'success');
                    LB.navigate(data.redirect || '/location');
                })
                .catch(() => {
                    LB.setLoading(btn, false);
                    LB.toast('Network error — please try again.', 'error');
                });
        });

        // Panel Switchers
        document.getElementById('forgotLink')?.addEventListener('click', () => {
            LB.showScreen('scr-fp-email');
        });

        document.getElementById('createAccBtn')?.addEventListener('click', (e) => {
            LB.ripple(e, e.target);
            setTimeout(() => LB.navigate('/customer/register'), 300);
        });

        document.getElementById('fpBackToLogin')?.addEventListener('click', () => LB.showScreen('scr-login', true));
        document.getElementById('fpOtpBack')?.addEventListener('click', () => LB.showScreen('scr-fp-email', true));
        document.getElementById('fpResetBack')?.addEventListener('click', () => LB.showScreen('scr-fp-otp', true));
        document.getElementById('fpReturnLogin')?.addEventListener('click', () => LB.showScreen('scr-login', true));

        // Submit Email to Send OTP
        const fpEmailForm = document.getElementById('fpEmailForm');
        fpEmailForm?.addEventListener('submit', e => {
            e.preventDefault();
            if (!LB.validateForm(fpEmailForm)) return;

            const emailVal = document.getElementById('fpEmail').value.trim();
            showOverlay('Sending OTP verification code...');

            authApi('send-otp', { email: emailVal, role: 'customer', purpose: 'reset' })
                .then(({ ok, data }) => {
                    hideOverlay();
                    if (!ok || !data.success) {
                        LB.toast(data.message || 'Could not send the code. Please try again.', 'error');
                        return;
                    }
                    document.getElementById('fpOtpEmail').textContent = emailVal;
                    LB.showScreen('scr-fp-otp');
                    setupOtpBoxes('#fpOtpWrap');
                    startTimer(document.getElementById('fpTimer'), document.getElementById('fpResend'));
                })
                .catch(() => {
                    hideOverlay();
                    LB.toast('Network error — please try again.', 'error');
                });
        });

        // Verify OTP code
        document.getElementById('fpVerifyBtn')?.addEventListener('click', () => {
            const otp = readOtp('#fpOtpWrap');
            if (otp.length !== 6) {
                LB.toast('Please fill all 6 digits of the OTP', 'error');
                return;
            }
            const emailVal = document.getElementById('fpEmail').value.trim();
            const btn = document.getElementById('fpVerifyBtn');
            LB.setLoading(btn, true);

            authApi('verify-otp', { email: emailVal, role: 'customer', purpose: 'reset', otp })
                .then(({ ok, data }) => {
                    LB.setLoading(btn, false);
                    if (!ok || !data.success) {
                        LB.toast(data.message || 'Incorrect code. Please try again.', 'error');
                        return;
                    }
                    LB.showScreen('scr-fp-reset');
                })
                .catch(() => {
                    LB.setLoading(btn, false);
                    LB.toast('Network error — please try again.', 'error');
                });
        });

        // Resend Button
        document.getElementById('fpResend')?.addEventListener('click', () => {
            const emailVal = document.getElementById('fpEmail').value.trim();
            authApi('send-otp', { email: emailVal, role: 'customer', purpose: 'reset' })
                .then(({ ok, data }) => {
                    if (!ok || !data.success) {
                        LB.toast(data.message || 'Could not resend the code.', 'error');
                        return;
                    }
                    startTimer(document.getElementById('fpTimer'), document.getElementById('fpResend'));
                    LB.toast('A new verification code was sent!', 'success');
                })
                .catch(() => LB.toast('Network error — please try again.', 'error'));
        });

        // Reset password
        const fpResetForm = document.getElementById('fpResetForm');
        fpResetForm?.addEventListener('submit', e => {
            e.preventDefault();
            if (!LB.validateForm(fpResetForm)) return;

            const newPw = document.getElementById('fpNewPw').value;
            const confirmPw = document.getElementById('fpConfirmPw').value;
            if (newPw !== confirmPw) {
                LB.toast('Passwords do not match.', 'error');
                return;
            }

            const emailVal = document.getElementById('fpEmail').value.trim();
            const btn = fpResetForm.querySelector('button[type="submit"]');
            LB.setLoading(btn, true);

            authApi('reset-password', { email: emailVal, role: 'customer', new_password: newPw })
                .then(({ ok, data }) => {
                    LB.setLoading(btn, false);
                    if (!ok || !data.success) {
                        LB.toast(data.message || 'Could not reset password. Please try again.', 'error');
                        return;
                    }
                    LB.showScreen('scr-fp-success');
                })
                .catch(() => {
                    LB.setLoading(btn, false);
                    LB.toast('Network error — please try again.', 'error');
                });
        });
    }

    /* ── BUSINESS LOGIN FLOWS ── */
    if (page === 'business-login') {
        const bizLoginForm = document.getElementById('bizLoginForm');
        bizLoginForm?.addEventListener('submit', e => {
            e.preventDefault();
            if (!LB.validateForm(bizLoginForm)) return;

            const btn = bizLoginForm.querySelector('button[type="submit"]');
            const payload = {
                username: document.getElementById('bizUsername').value.trim(),
                password: document.getElementById('bizPassword').value
            };

            LB.setLoading(btn, true);
            fetch('/business/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
                .then(res => res.json().then(data => ({ ok: res.ok, data })))
                .then(({ ok, data }) => {
                    LB.setLoading(btn, false);
                    if (!ok || !data.success) {
                        LB.toast(data.message || 'Invalid username or password.', 'error');
                        return;
                    }
                    LB.toast('Login successful! Welcome to Dashboard.', 'success');
                    LB.navigate(data.redirect || '/business/dashboard');
                })
                .catch(() => {
                    LB.setLoading(btn, false);
                    LB.toast('Network error — please try again.', 'error');
                });
        });

        document.getElementById('bizForgotLink')?.addEventListener('click', () => {
            LB.showScreen('scr-bfp-email');
        });

        document.getElementById('createBizBtn')?.addEventListener('click', (e) => {
            LB.ripple(e, e.target);
            setTimeout(() => LB.navigate('/business/register'), 300);
        });

        document.getElementById('bizFpReturnLogin')?.addEventListener('click', () => LB.showScreen('scr-biz-login', true));
        document.getElementById('bizFpOtpBack')?.addEventListener('click', () => LB.showScreen('scr-bfp-email', true));
        document.getElementById('bizFpResetBack')?.addEventListener('click', () => LB.showScreen('scr-bfp-otp', true));

        // Business forgot email
        const bizFpEmailForm = document.getElementById('bizFpEmailForm');
        bizFpEmailForm?.addEventListener('submit', e => {
            e.preventDefault();
            if (!LB.validateForm(bizFpEmailForm)) return;

            const emailVal = document.getElementById('bizFpEmail').value.trim();
            showOverlay('Sending business reset code...');

            authApi('send-otp', { email: emailVal, role: 'business', purpose: 'reset' })
                .then(({ ok, data }) => {
                    hideOverlay();
                    if (!ok || !data.success) {
                        LB.toast(data.message || 'Could not send the code. Please try again.', 'error');
                        return;
                    }
                    document.getElementById('bizFpOtpEmail').textContent = emailVal;
                    LB.showScreen('scr-bfp-otp');
                    setupOtpBoxes('#bizFpOtpWrap');
                    startTimer(document.getElementById('bizFpTimer'), document.getElementById('bizFpResend'));
                })
                .catch(() => {
                    hideOverlay();
                    LB.toast('Network error — please try again.', 'error');
                });
        });

        // Business verify OTP
        document.getElementById('bizFpVerifyBtn')?.addEventListener('click', () => {
            const otp = readOtp('#bizFpOtpWrap');
            if (otp.length !== 6) {
                LB.toast('Please fill all 6 digits of the OTP', 'error');
                return;
            }
            const emailVal = document.getElementById('bizFpEmail').value.trim();
            const btn = document.getElementById('bizFpVerifyBtn');
            LB.setLoading(btn, true);

            authApi('verify-otp', { email: emailVal, role: 'business', purpose: 'reset', otp })
                .then(({ ok, data }) => {
                    LB.setLoading(btn, false);
                    if (!ok || !data.success) {
                        LB.toast(data.message || 'Incorrect code. Please try again.', 'error');
                        return;
                    }
                    LB.showScreen('scr-bfp-reset');
                })
                .catch(() => {
                    LB.setLoading(btn, false);
                    LB.toast('Network error — please try again.', 'error');
                });
        });

        document.getElementById('bizFpResend')?.addEventListener('click', () => {
            const emailVal = document.getElementById('bizFpEmail').value.trim();
            authApi('send-otp', { email: emailVal, role: 'business', purpose: 'reset' })
                .then(({ ok, data }) => {
                    if (!ok || !data.success) {
                        LB.toast(data.message || 'Could not resend the code.', 'error');
                        return;
                    }
                    startTimer(document.getElementById('bizFpTimer'), document.getElementById('bizFpResend'));
                    LB.toast('New business verification code sent!', 'success');
                })
                .catch(() => LB.toast('Network error — please try again.', 'error'));
        });

        // Reset business password
        const bizFpResetForm = document.getElementById('bizFpResetForm');
        bizFpResetForm?.addEventListener('submit', e => {
            e.preventDefault();
            if (!LB.validateForm(bizFpResetForm)) return;

            const newPw = document.getElementById('bizNewPw').value;
            const confirmPw = document.getElementById('bizConfirmPw').value;
            if (newPw !== confirmPw) {
                LB.toast('Passwords do not match.', 'error');
                return;
            }

            const emailVal = document.getElementById('bizFpEmail').value.trim();
            const btn = bizFpResetForm.querySelector('button[type="submit"]');
            LB.setLoading(btn, true);

            authApi('reset-password', { email: emailVal, role: 'business', new_password: newPw })
                .then(({ ok, data }) => {
                    LB.setLoading(btn, false);
                    if (!ok || !data.success) {
                        LB.toast(data.message || 'Could not reset password. Please try again.', 'error');
                        return;
                    }
                    LB.showScreen('scr-bfp-success');
                })
                .catch(() => {
                    LB.setLoading(btn, false);
                    LB.toast('Network error — please try again.', 'error');
                });
        });
    }
});
