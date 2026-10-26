/**
 * ============================================================
 *  LocalBites — Registration Interactions (register.js)
 * ============================================================
 */

'use strict';

document.addEventListener('DOMContentLoaded', () => {
    const page = document.body.dataset.page;
    if (page !== 'customer-register' && page !== 'business-register') return;

    const card = document.querySelector('.auth-card');

    // Utility step status dots setter
    const setStepDots = (stepNumber) => {
        document.querySelectorAll('.step-dot').forEach((dot, idx) => {
            dot.classList.remove('active', 'done');
            if (idx + 1 === stepNumber) dot.classList.add('active');
            else if (idx + 1 < stepNumber) dot.classList.add('done');
        });
    };

    // OTP box auto focus advance
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
    // customer and business registration OTP steps.
    const authApi = (path, payload) =>
        fetch(`/auth/${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).then(res => res.json().then(data => ({ ok: res.ok, data })));

    /* ── CUSTOMER REGISTRATION ── */
    if (page === 'customer-register') {
        const regEmailForm = document.getElementById('regEmailForm');

        regEmailForm?.addEventListener('submit', e => {
            e.preventDefault();
            if (!LB.validateForm(regEmailForm)) return;

            const emailVal = document.getElementById('regEmail').value.trim();
            showOverlay('Generating OTP code...');

            authApi('send-otp', { email: emailVal, role: 'customer', purpose: 'register' })
                .then(({ ok, data }) => {
                    hideOverlay();
                    if (!ok || !data.success) {
                        LB.toast(data.message || 'Could not send the code. Please try again.', 'error');
                        return;
                    }
                    document.getElementById('regOtpEmail').textContent = emailVal;
                    LB.showScreen('scr-reg-otp');
                    setStepDots(2);
                    setupOtpBoxes('#regOtpWrap');
                    startTimer(document.getElementById('regTimer'), document.getElementById('regResend'));
                })
                .catch(() => {
                    hideOverlay();
                    LB.toast('Network error — please try again.', 'error');
                });
        });

        document.getElementById('regOtpBack')?.addEventListener('click', () => {
            LB.showScreen('scr-reg-email', true);
            setStepDots(1);
        });

        document.getElementById('regResend')?.addEventListener('click', () => {
            const emailVal = document.getElementById('regEmail').value.trim();
            authApi('send-otp', { email: emailVal, role: 'customer', purpose: 'register' })
                .then(({ ok, data }) => {
                    if (!ok || !data.success) {
                        LB.toast(data.message || 'Could not resend the code.', 'error');
                        return;
                    }
                    startTimer(document.getElementById('regTimer'), document.getElementById('regResend'));
                    LB.toast('OTP verification code resent!', 'success');
                })
                .catch(() => LB.toast('Network error — please try again.', 'error'));
        });

        // Verify registration email code
        document.getElementById('regVerifyBtn')?.addEventListener('click', () => {
            const otp = readOtp('#regOtpWrap');
            if (otp.length !== 6) {
                LB.toast('Please fill all 6 digits of the OTP code', 'error');
                return;
            }
            const emailVal = document.getElementById('regEmail').value.trim();
            const btn = document.getElementById('regVerifyBtn');
            LB.setLoading(btn, true);

            authApi('verify-otp', { email: emailVal, role: 'customer', purpose: 'register', otp })
                .then(({ ok, data }) => {
                    LB.setLoading(btn, false);
                    if (!ok || !data.success) {
                        LB.toast(data.message || 'Incorrect code. Please try again.', 'error');
                        return;
                    }
                    LB.showScreen('scr-reg-details');
                    setStepDots(3);
                })
                .catch(() => {
                    LB.setLoading(btn, false);
                    LB.toast('Network error — please try again.', 'error');
                });
        });

        document.getElementById('regDetailsBack')?.addEventListener('click', () => {
            LB.showScreen('scr-reg-otp', true);
            setStepDots(2);
        });

        // Details Submit — this is the real account creation call.
        const regDetailsForm = document.getElementById('regDetailsForm');
        regDetailsForm?.addEventListener('submit', e => {
            e.preventDefault();
            if (!LB.validateForm(regDetailsForm)) return;

            const btn = regDetailsForm.querySelector('button[type="submit"]');
            LB.setLoading(btn, true);

            const payload = {
                full_name: document.getElementById('regFullName')?.value.trim() || '',
                phone: document.getElementById('regPhone')?.value.trim() || '',
                username: document.getElementById('regUsername').value.trim(),
                email: document.getElementById('regEmail').value.trim(),
                password: document.getElementById('regPassword').value
            };

            fetch('/customer/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
                .then(res => res.json().then(data => ({ ok: res.ok, data })))
                .then(({ ok, data }) => {
                    LB.setLoading(btn, false);
                    if (!ok || !data.success) {
                        LB.toast(data.message || 'Something went wrong. Please try again.', 'error');
                        return;
                    }
                    LB.showScreen('scr-reg-success');
                    setStepDots(4);
                })
                .catch(() => {
                    LB.setLoading(btn, false);
                    LB.toast('Network error — please try again.', 'error');
                });
        });

        document.getElementById('regReturnLogin')?.addEventListener('click', () => {
            LB.navigate('/customer/login');
        });
    }

    /* ── BUSINESS REGISTRATION ── */
    if (page === 'business-register') {
        const bizRegForm = document.getElementById('bizRegForm');
        bizRegForm?.addEventListener('submit', e => {
            e.preventDefault();
            if (!LB.validateForm(bizRegForm)) return;

            const btn = document.getElementById('bizRegContinue');
            const emailVal = document.getElementById('bizEmail').value.trim();
            LB.setLoading(btn, true);
            showOverlay('Sending OTP verification code...');

            authApi('send-otp', { email: emailVal, role: 'business', purpose: 'register' })
                .then(({ ok, data }) => {
                    LB.setLoading(btn, false);
                    hideOverlay();
                    if (!ok || !data.success) {
                        LB.toast(data.message || 'Could not send the code. Please try again.', 'error');
                        return;
                    }
                    document.getElementById('bizRegOtpEmail').textContent = emailVal;
                    LB.showScreen('scr-biz-otp');
                    setStepDots(2);
                    setupOtpBoxes('#bizRegOtpWrap');
                    startTimer(document.getElementById('bizRegTimer'), document.getElementById('bizRegResend'));
                })
                .catch(() => {
                    LB.setLoading(btn, false);
                    hideOverlay();
                    LB.toast('Network error — please try again.', 'error');
                });
        });

        // Back to Business Details
        document.getElementById('bizRegOtpBack')?.addEventListener('click', () => {
            LB.showScreen('scr-biz-details', true);
            setStepDots(1);
        });

        // Resend OTP
        document.getElementById('bizRegResend')?.addEventListener('click', () => {
            const emailVal = document.getElementById('bizEmail').value.trim();
            authApi('send-otp', { email: emailVal, role: 'business', purpose: 'register' })
                .then(({ ok, data }) => {
                    if (!ok || !data.success) {
                        LB.toast(data.message || 'Could not resend the code.', 'error');
                        return;
                    }
                    startTimer(document.getElementById('bizRegTimer'), document.getElementById('bizRegResend'));
                    LB.toast('A new verification code was sent!', 'success');
                })
                .catch(() => LB.toast('Network error — please try again.', 'error'));
        });

        // Verify OTP → Business & Owner Document Verification (Step 3)
        document.getElementById('bizRegVerifyBtn')?.addEventListener('click', () => {
            const otp = readOtp('#bizRegOtpWrap');
            if (otp.length !== 6) {
                LB.toast('Please fill all 6 digits of the OTP', 'error');
                return;
            }
            const emailVal = document.getElementById('bizEmail').value.trim();
            const btn = document.getElementById('bizRegVerifyBtn');
            LB.setLoading(btn, true);

            authApi('verify-otp', { email: emailVal, role: 'business', purpose: 'register', otp })
                .then(({ ok, data }) => {
                    LB.setLoading(btn, false);
                    if (!ok || !data.success) {
                        LB.toast(data.message || 'Incorrect code. Please try again.', 'error');
                        return;
                    }
                    LB.showScreen('scr-biz-docs');
                    setStepDots(3);
                })
                .catch(() => {
                    LB.setLoading(btn, false);
                    LB.toast('Network error — please try again.', 'error');
                });
        });

        // ── BUSINESS & OWNER DOCUMENT VERIFICATION (STEP 3) ──
        // Frontend-only state: tracks selected filenames — nothing is stored or uploaded.
        const bizDocsState = {
            owner: null,          // Owner Identity Proof filename
            biz: null,            // Food Business Proof filename
            premisesType: null,   // 'owned' | 'rented'
            premises: null        // filename for the selected premises type
        };

        const setPremisesType = (type) => {
            bizDocsState.premisesType = type;
            document.getElementById('bizPremOwnedBtn').classList.toggle('active', type === 'owned');
            document.getElementById('bizPremRentedBtn').classList.toggle('active', type === 'rented');
            document.getElementById('bizPremOwnedWrap').classList.toggle('active', type === 'owned');
            document.getElementById('bizPremRentedWrap').classList.toggle('active', type === 'rented');
        };

        document.getElementById('bizPremOwnedBtn')?.addEventListener('click', () => setPremisesType('owned'));
        document.getElementById('bizPremRentedBtn')?.addEventListener('click', () => setPremisesType('rented'));

        const ACCEPTED_EXTS = ['.jpg', '.jpeg', '.png', '.pdf'];
        const MAX_FILE_MB = 5;

        const docConfigs = [
            { key: 'owner', input: 'bizDocOwnerInput', btn: 'bizDocOwnerBtn', state: 'bizDocOwnerState', name: 'bizDocOwnerName', remove: 'bizDocOwnerRemove', card: 'bizDocOwnerCard' },
            { key: 'biz', input: 'bizDocBizInput', btn: 'bizDocBizBtn', state: 'bizDocBizState', name: 'bizDocBizName', remove: 'bizDocBizRemove', card: 'bizDocBizCard' },
            { key: 'premises-owned', input: 'bizDocPremOwnedInput', btn: 'bizDocPremOwnedBtn', state: 'bizDocPremOwnedState', name: 'bizDocPremOwnedName', remove: 'bizDocPremOwnedRemove', card: null },
            { key: 'premises-rented', input: 'bizDocPremRentedInput', btn: 'bizDocPremRentedBtn', state: 'bizDocPremRentedState', name: 'bizDocPremRentedName', remove: 'bizDocPremRentedRemove', card: null }
        ];

        const applyDocSelection = (cfg, file) => {
            const inputEl = document.getElementById(cfg.input);
            const stateEl = document.getElementById(cfg.state);
            const nameEl = document.getElementById(cfg.name);
            const cardEl = cfg.card ? document.getElementById(cfg.card) : null;

            if (!file) {
                // Remove / clear selection
                bizDocsState[cfg.key] = null;
                if (inputEl) inputEl.value = '';
                stateEl?.classList.add('hidden');
                if (nameEl) nameEl.textContent = 'No file selected';
                if (cardEl) cardEl.classList.remove('with-file');
                return;
            }

            const lowerName = file.name.toLowerCase();
            const validExt = ACCEPTED_EXTS.some(ext => lowerName.endsWith(ext));
            const validSize = file.size <= MAX_FILE_MB * 1024 * 1024;

            if (!validExt || !validSize) {
                LB.toast(`Invalid file. Accepted: ${ACCEPTED_EXTS.join(', ').replace(/\./g, '').toUpperCase()} · Max ${MAX_FILE_MB} MB`, 'error');
                if (inputEl) inputEl.value = '';
                return;
            }

            // Simulated "upload" — only the filename is kept in memory (prototype).
            bizDocsState[cfg.key] = file.name;
            if (nameEl) nameEl.textContent = file.name;
            stateEl?.classList.remove('hidden');
            if (cardEl) cardEl.classList.add('with-file');
            LB.toast('Document uploaded — Pending Admin Verification', 'success');
        };

        docConfigs.forEach(cfg => {
            const inputEl = document.getElementById(cfg.input);
            const btnEl = document.getElementById(cfg.btn);
            const removeEl = document.getElementById(cfg.remove);

            btnEl?.addEventListener('click', () => inputEl?.click());
            inputEl?.addEventListener('change', () => {
                const file = inputEl.files[0];
                applyDocSelection(cfg, file);
            });
            removeEl?.addEventListener('click', () => {
                applyDocSelection(cfg, null);
                LB.toast('Document removed', 'info');
            });
        });

        // Validate all required documents before continuing
        const isDocsSectionComplete = () => {
            const premKey = bizDocsState.premisesType ? `premises-${bizDocsState.premisesType}` : null;
            return !!bizDocsState.owner && !!bizDocsState.biz && !!premKey && !!bizDocsState[premKey];
        };

        document.getElementById('bizRegDocsContinue')?.addEventListener('click', () => {
            if (!bizDocsState.owner) {
                LB.toast('Please upload Owner Identity Proof', 'error');
                return;
            }
            if (!bizDocsState.biz) {
                LB.toast('Please upload Food Business Proof', 'error');
                return;
            }
            if (!bizDocsState.premisesType) {
                LB.toast('Please select whether your premises are owned or rented', 'error');
                return;
            }
            const premKey = `premises-${bizDocsState.premisesType}`;
            if (!bizDocsState[premKey]) {
                LB.toast('Please upload the premises proof document', 'error');
                return;
            }
            const btn = document.getElementById('bizRegDocsContinue');
            LB.setLoading(btn, true);
            setTimeout(() => {
                LB.setLoading(btn, false);
                LB.showScreen('scr-biz-account');
                setStepDots(4);
            }, 1200);
        });

        // Back to OTP step
        document.getElementById('bizRegDocsBack')?.addEventListener('click', () => {
            LB.showScreen('scr-biz-otp', true);
            setStepDots(2);
        });

        // ── BUSINESS ACCOUNT SETUP (STEP 4) ──
        // Back to Document Verification step
        document.getElementById('bizRegAccountBack')?.addEventListener('click', () => {
            LB.showScreen('scr-biz-docs', true);
            setStepDots(3);
        });

        // Business Account Setup Submit → real account creation call.
        // All the fields from steps 1 and 4 live in the same page (just
        // hidden/shown screens), so we can read them straight from the DOM.
        // Sent as multipart/form-data (not JSON) so the actual document
        // files selected in Step 3 travel with the request, not just
        // their filenames.
        const bizRegAccountForm = document.getElementById('bizRegAccountForm');
        bizRegAccountForm?.addEventListener('submit', e => {
            e.preventDefault();
            if (!LB.validateForm(bizRegAccountForm)) return;

            const btn = document.getElementById('bizRegAccountContinue');
            LB.setLoading(btn, true);

            const formData = new FormData();
            formData.append('business_name', document.getElementById('bizName').value.trim());
            formData.append('owner_name', document.getElementById('ownerName').value.trim());
            formData.append('email', document.getElementById('bizEmail').value.trim());
            formData.append('phone', document.getElementById('bizMobile').value.trim());
            formData.append('business_type', document.getElementById('bizType').value);
            formData.append('username', document.getElementById('bizRegUsername').value.trim());
            formData.append('password', document.getElementById('bizAccountPw').value);
            formData.append('premises_type', bizDocsState.premisesType || '');
            formData.append('address', document.getElementById('bizAddress').value.trim());

            const ownerFile = document.getElementById('bizDocOwnerInput')?.files[0];
            const bizFile = document.getElementById('bizDocBizInput')?.files[0];
            const premisesInputId = bizDocsState.premisesType === 'owned'
                ? 'bizDocPremOwnedInput'
                : 'bizDocPremRentedInput';
            const premisesFile = document.getElementById(premisesInputId)?.files[0];

            if (ownerFile) formData.append('doc_owner', ownerFile);
            if (bizFile) formData.append('doc_business', bizFile);
            if (premisesFile) formData.append('doc_premises', premisesFile);

            fetch('/business/register', {
                method: 'POST',
                // No Content-Type header here on purpose — the browser sets
                // multipart/form-data with the correct boundary itself.
                body: formData
            })
                .then(res => res.json().then(data => ({ ok: res.ok, data })))
                .then(({ ok, data }) => {
                    LB.setLoading(btn, false);
                    if (!ok || !data.success) {
                        LB.toast(data.message || 'Something went wrong. Please try again.', 'error');
                        return;
                    }
                    LB.showScreen('scr-biz-success');
                    setStepDots(5);
                })
                .catch(() => {
                    LB.setLoading(btn, false);
                    LB.toast('Network error — please try again.', 'error');
                });
        });

        // Return to Business Login
        document.getElementById('bizRegReturnLogin')?.addEventListener('click', () => {
            LB.navigate('/business/login');
        });
    }
});
