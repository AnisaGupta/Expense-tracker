/**
 * ============================================================
 *  LocalBites — Payment Page Controller (payment.js)
 *  Loads the real order created by /customer/api/checkout, then
 *  either opens Razorpay Checkout (online) or confirms a
 *  Cash-on-Delivery order — both against real backend endpoints.
 * ============================================================
 */

'use strict';

document.addEventListener('DOMContentLoaded', async () => {
    const page = document.body.dataset.page;
    if (page !== 'payment') return;

    const orderId = sessionStorage.getItem('active_order_id');

    const showState = (id) => {
        ['paymentLoadingState', 'paymentContent', 'paymentSuccessState', 'paymentErrorState']
            .forEach(elId => document.getElementById(elId).classList.toggle('hidden', elId !== id));
    };

    const showError = (message) => {
        document.getElementById('lblErrorMessage').textContent = message;
        showState('paymentErrorState');
    };

    if (!orderId) {
        showError("We couldn't find an order to pay for. Please checkout again from a business's menu.");
        return;
    }

    let order = null;
    try {
        const res = await fetch(`/customer/api/orders/${orderId}`, { credentials: 'same-origin' });
        const data = await res.json();
        if (!res.ok || !data.order) throw new Error(data.message || 'Order not found.');
        order = data.order;
    } catch (e) {
        showError(e.message);
        return;
    }

    // Already paid / already confirmed — don't let the customer pay twice
    if (order.paymentStatus === 'success' || order.status !== 'pending') {
        document.getElementById('lblSuccessMessage').textContent =
            `Order #${order.id} at ${order.businessName} is already confirmed.`;
        showState('paymentSuccessState');
        return;
    }

    // Populate order summary
    document.getElementById('lblPayBusinessName').textContent = order.businessName;
    document.getElementById('paymentItemsList').innerHTML = order.items.map(item => `
        <div class="payment-order-item-row">
            <span>${item.name} × ${item.quantity}</span>
            <span>₹${(item.price * item.quantity).toFixed(0)}</span>
        </div>
    `).join('');
    document.getElementById('lblPayTotal').textContent = `₹${order.totalAmount.toFixed(0)}`;

    document.getElementById('onlinePaymentCard').classList.toggle('hidden', order.paymentMethod !== 'online');
    document.getElementById('codPaymentCard').classList.toggle('hidden', order.paymentMethod !== 'cod');

    showState('paymentContent');

    // ── ONLINE PAYMENT (Razorpay) ──
    document.getElementById('btnPayNow')?.addEventListener('click', async () => {
        const btn = document.getElementById('btnPayNow');
        LB.setLoading(btn, true);

        try {
            const res = await fetch(`/customer/api/orders/${order.id}/razorpay-order`, {
                method: 'POST',
                credentials: 'same-origin',
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.message || 'Could not start payment.');

            if (typeof Razorpay === 'undefined') {
                throw new Error('Payment couldn\'t load. Check your internet connection and try again.');
            }

            const rzp = new Razorpay({
                key: data.keyId,
                amount: data.amount,
                currency: data.currency,
                name: data.businessName,
                description: `Order #${order.id}`,
                order_id: data.razorpayOrderId,
                prefill: {
                    name: data.customerName,
                    email: data.customerEmail,
                    contact: data.customerPhone,
                },
                theme: { color: '#FF6B35' },
                handler: async (response) => {
                   try {
                        const verifyRes = await fetch(`/customer/api/orders/${order.id}/razorpay-verify`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'same-origin',
                            body: JSON.stringify({
                                ...response, // includes razorpay_payment_id, order_id, signature
                                delivery_type: order.deliveryType || 'delivery' // 👈 Placed safely inside JSON.stringify
                            }),
                        });
                        const verifyData = await verifyRes.json();
                        if (!verifyRes.ok || !verifyData.success) {
                            throw new Error(verifyData.message || 'Payment verification failed.');
                        }
                        sessionStorage.removeItem('active_order_id');
                        document.getElementById('lblSuccessMessage').textContent =
                            `Payment successful! Order #${order.id} has been sent to ${order.businessName}.`;
                        showState('paymentSuccessState');
                        // ── PASTE THE TOAST ALERT RIGHT HERE ──
                        LB.toast('Payment successful! Order placed.', 'success');
                    } catch (e) {
                        LB.toast(e.message, 'error');
                    }
                },
                modal: {
                    ondismiss: () => LB.setLoading(btn, false),
                },
            });

            rzp.on('payment.failed', () => {
                LB.toast('Payment failed. Please try again.', 'error');
            });

            rzp.open();
        } catch (e) {
            LB.toast(e.message, 'error');
        } finally {
            LB.setLoading(btn, false);
        }
    });

    // ── CASH ON DELIVERY ──
    document.getElementById('btnConfirmCod')?.addEventListener('click', async () => {
        const btn = document.getElementById('btnConfirmCod');
        LB.setLoading(btn, true);

        try {
            const res = await fetch(`/customer/api/orders/${order.id}/confirm-cod`, {
                method: 'POST',
                credentials: 'same-origin',
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.message || 'Could not confirm your order.');

            sessionStorage.removeItem('active_order_id');
            document.getElementById('lblSuccessMessage').textContent =
                `Order #${order.id} confirmed! Pay ₹${order.totalAmount.toFixed(0)} in cash to ${order.businessName}.`;
            showState('paymentSuccessState');
        } catch (e) {
            LB.toast(e.message, 'error');
        } finally {
            LB.setLoading(btn, false);
        }
    });
});
