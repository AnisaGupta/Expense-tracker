/**
 * ============================================================
 *  LocalBites — Customer Profile Page (profile.js)
 *  Matches the current server-rendered profile.html: a details
 *  form (save via /customer/profile POST) and a sign-out button.
 * ============================================================
 */

'use strict';

document.addEventListener('DOMContentLoaded', () => {
    const $ = (id) => document.getElementById(id);

    // ── AUTOMATIC CURRENT DELIVERY ADDRESS CAPTURE ──
    // Only fill the field when it is blank or contains the old placeholder.
    // Keep any real address entered by the customer unchanged.
    const addressField = $('custAddress');
    const existingAddress = (addressField?.value || '').trim();
    const isGpsPlaceholder = /^current location(?:\s*\(gps\))?$/i.test(existingAddress);

    if (addressField && (!existingAddress || isGpsPlaceholder) && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async (position) => {
            try {
                const { latitude, longitude } = position.coords;
                const response = await fetch(
                    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`
                );
                if (!response.ok) return;

                const result = await response.json();
                const detectedAddress = (result.display_name || '').trim();

                // Replace only an empty field or the outdated GPS placeholder.
                const currentValue = (addressField.value || '').trim();
                if (detectedAddress && (!currentValue || /^current location(?:\s*\(gps\))?$/i.test(currentValue))) {
                    addressField.value = detectedAddress;
                }
            } catch (error) {
                console.warn('Could not convert the current location to a delivery address.', error);
            }
        }, (error) => {
            console.warn('Current location could not be captured:', error.message);
        }, {
            enableHighAccuracy: false,
            timeout: 20000,
            maximumAge: 60000
        });
    }

    // ── SAVE PROFILE CHANGES ──
    const form = $('profileUpdateForm');
    form?.addEventListener('submit', (e) => {
        e.preventDefault();

        const payload = {
            full_name: $('custFullName').value.trim(),
            email: $('custEmail').value.trim(),
            phone: $('custPhone').value.trim(),
            address: $('custAddress').value.trim()
        };

        const btn = $('btnSaveProfile');
        LB.setLoading(btn, true);

        fetch('/customer/profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
            .then(res => res.json().then(data => ({ ok: res.ok, data })))
            .then(({ ok, data }) => {
                LB.setLoading(btn, false);
                if (!ok || !data.success) {
                    LB.toast(data.message || 'Could not save changes. Please try again.', 'error');
                    return;
                }
                LB.toast(data.message || 'Profile updated successfully.', 'success');
                // Keep the sidebar name/username in sync with what was just saved
                $('displayFullName').textContent = payload.full_name;
            })
            .catch(() => {
                LB.setLoading(btn, false);
                LB.toast('Network error — please try again.', 'error');
            });
    });

    // ── SIGN OUT ──
    $('btnLogout')?.addEventListener('click', () => {
        LB.toast('Signing out...', 'info');
        LB.logout('/customer/logout', '/customer/login');
    });
});

// ---------------------------------------------------------
// REFRESH PROFILE WHEN RETURNING TO THIS PAGE
// ---------------------------------------------------------

window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
        window.location.reload();
    }
});