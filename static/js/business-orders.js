/**
 * LocalBites — Business Orders
 * MySQL-backed orders + delivery-person assignment
 */

'use strict';

document.addEventListener('DOMContentLoaded', () => {

    const page = document.body.dataset.page;

    if (page !== 'business-orders') return;

    LB_Biz.initCommonUI('orders');

    let activeFilter = 'all';
    let orders = [];
    let deliveryPersons = [];

    // ============================================================
    // LOAD ORDERS
    // ============================================================

    async function loadOrders() {

        try {

            const response = await fetch('/business/api/orders');

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(
                    data.message || 'Could not load orders.'
                );
            }

            orders = data.orders || [];

            renderOrdersList();

        } catch (error) {

            console.error('Error loading orders:', error);

            LB.toast(
                error.message || 'Could not load orders.',
                'error'
            );
        }
    }


    // ============================================================
    // LOAD DELIVERY PERSONS
    // ============================================================

    async function loadDeliveryPersons() {

        try {

            const response = await fetch(
                '/business/api/delivery-persons'
            );

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(
                    data.message ||
                    'Could not load delivery persons.'
                );
            }

            deliveryPersons = data.deliveryPersons || [];

        } catch (error) {

            console.error(
                'Error loading delivery persons:',
                error
            );

            deliveryPersons = [];
        }
    }


    // ============================================================
    // RENDER DELIVERY PERSON ASSIGNMENT
    // ============================================================

    function renderDeliveryAssignment(order) {

        // Pickup orders don't need a delivery person
        if (
            String(order.deliveryType).toLowerCase() !==
            'delivery'
        ) {
            return '';
        }

        // Only show assignment for orders that still need
        // delivery assignment.
        const canAssign = [
            'confirmed',
            'preparing',
            'ready'
        ].includes(order.status);

        if (!canAssign) {
            if (order.deliveryPerson) {

                return `
                    <div style="
                        margin-top: 10px;
                        padding: 9px 11px;
                        background: #f7f7f7;
                        border-radius: 8px;
                        font-size: 12px;
                    ">
                        <strong>Delivery Person:</strong>
                        ${order.deliveryPerson.name}
                    </div>
                `;
            }

            return '';
        }

        if (deliveryPersons.length === 0) {

            return `
                <div style="
                    margin-top: 10px;
                    padding: 10px;
                    background: #fff4ed;
                    border-radius: 8px;
                    font-size: 12px;
                    color: #9a3412;
                ">
                    No delivery persons available.
                </div>
            `;
        }

        const currentId =
            order.deliveryPerson
                ? String(order.deliveryPerson.id)
                : '';

        const options = deliveryPersons.map(person => `
            <option
                value="${person.id}"
                ${String(person.id) === currentId ? 'selected' : ''}
            >
                ${person.name}
            </option>
        `).join('');

        return `
            <div style="
                margin-top: 10px;
                padding: 11px;
                background: #fafafa;
                border: 1px solid #eeeeee;
                border-radius: 9px;
            ">

                <div style="
                    font-size: 11px;
                    font-weight: 700;
                    color: #777;
                    text-transform: uppercase;
                    margin-bottom: 6px;
                ">
                    Delivery Person
                </div>

                <div style="
                    display: flex;
                    gap: 7px;
                    align-items: center;
                ">

                    <select
                        class="delivery-person-select"
                        data-order-id="${order.id}"
                        style="
                            flex: 1;
                            padding: 8px 9px;
                            border: 1px solid #ddd;
                            border-radius: 7px;
                            background: white;
                            font-size: 12px;
                            color: #333;
                            outline: none;
                        "
                    >
                        <option value="">
                            Select delivery person
                        </option>

                        ${options}

                    </select>

                    <button
                        type="button"
                        class="btn-assign-delivery"
                        data-order-id="${order.id}"
                        style="
                            border: none;
                            padding: 8px 12px;
                            border-radius: 7px;
                            background: #FF6B35;
                            color: white;
                            font-size: 12px;
                            font-weight: 700;
                            cursor: pointer;
                            white-space: nowrap;
                        "
                    >
                        Assign
                    </button>

                </div>

            </div>
        `;
    }


    // ============================================================
    // RENDER STATUS ACTION
    // ============================================================

    function renderOrderActionsMarkup(order) {

        if (order.status === 'pending') {

            return `
                <button
                    class="btn-order-action btn btn-xs btn-secondary"
                    data-id="${order.id}"
                    data-action="confirmed"
                >
                    Accept
                </button>

                <button
                    class="btn-order-action btn btn-xs btn-danger-light"
                    data-id="${order.id}"
                    data-action="cancelled"
                >
                    Reject
                </button>
            `;
        }

        if (order.status === 'confirmed') {

            return `
                <button
                    class="btn-order-action btn btn-xs btn-primary"
                    data-id="${order.id}"
                    data-action="preparing"
                >
                    Prepare
                </button>
            `;
        }

        if (order.status === 'preparing') {

            return `
                <button
                    class="btn-order-action btn btn-xs btn-primary"
                    data-id="${order.id}"
                    data-action="ready"
                >
                    Ready
                </button>
            `;
        }

        if (order.status === 'ready') {

            return `
                <button
                    class="btn-order-action btn btn-xs btn-primary"
                    data-id="${order.id}"
                    data-action="out_for_delivery"
                >
                    Dispatch
                </button>
            `;
        }

        if (order.status === 'out_for_delivery') {

            return `
                <button
                    class="btn-order-action btn btn-xs btn-secondary"
                    data-id="${order.id}"
                    data-action="delivered"
                >
                    Delivered
                </button>
            `;
        }

        return '';
    }


    // ============================================================
    // RENDER ORDERS
    // ============================================================

    function renderOrdersList() {

        const list =
            document.getElementById('ordersMainList');

        const table =
            document.getElementById('ordersMainTable');

        const emptyState =
            document.getElementById('ordersEmptyState');

        const searchInput =
            document.getElementById('orderSearchInput');

        if (!list || !table || !emptyState) return;

        const searchQuery =
            searchInput
                ? searchInput.value.toLowerCase().trim()
                : '';

        let filteredOrders = [...orders];

        // Filters
        if (activeFilter === 'pending') {

            filteredOrders =
                filteredOrders.filter(
                    order => order.status === 'pending'
                );

        } else if (activeFilter === 'active') {

            filteredOrders =
                filteredOrders.filter(order =>
                    [
                        'confirmed',
                        'preparing',
                        'ready',
                        'out_for_delivery'
                    ].includes(order.status)
                );

        } else if (activeFilter === 'completed') {

            filteredOrders =
                filteredOrders.filter(
                    order => order.status === 'delivered'
                );

        } else if (activeFilter === 'cancelled') {

            filteredOrders =
                filteredOrders.filter(
                    order => order.status === 'cancelled'
                );
        }


        // Search
        if (searchQuery) {

            filteredOrders =
                filteredOrders.filter(order =>

                    String(order.customer || '')
                        .toLowerCase()
                        .includes(searchQuery)

                    ||

                    String(order.id)
                        .toLowerCase()
                        .includes(searchQuery)

                );
        }


        list.innerHTML = '';


        if (filteredOrders.length === 0) {

            table.style.display = 'none';

            emptyState.classList.remove('hidden');

            return;
        }


        table.style.display = 'table';

        emptyState.classList.add('hidden');


        filteredOrders.forEach(order => {

            const tr =
                document.createElement('tr');

            const itemsText =
                (order.items || [])
                    .map(item =>
                        `${item.name} (x${item.qty})`
                    )
                    .join(', ');


            let statusText =
                String(order.status || '')
                    .replace(/_/g, ' ');

            statusText =
                statusText.charAt(0).toUpperCase() +
                statusText.slice(1);


            const fulfillmentText =
                String(order.deliveryType).toLowerCase()
                === 'delivery'
                    ? '🚗 Delivery'
                    : '🏪 Pickup';


            tr.innerHTML = `

                <td data-label="Order ID">
                    <strong>#${order.id}</strong>
                </td>

                <td data-label="Customer">
                    ${order.customer || 'Customer'}
                </td>

                <td
                    data-label="Items"
                    title="${itemsText}"
                >
                    ${itemsText}
                </td>

                <td data-label="Amount">
                    <strong>₹${order.amount}</strong>
                </td>

                <td data-label="Time">
                    ${order.time || ''}
                </td>

                <td data-label="Fulfillment">
                    <span class="opt-badge">
                        ${fulfillmentText}
                    </span>
                </td>

                <td data-label="Status">
                    <span class="status-badge ${order.status}">
                        ${statusText}
                    </span>

                    ${renderDeliveryAssignment(order)}
                </td>

                <td data-label="Action">

                    <div class="action-btn-group">

                        <button
                            class="btn btn-xs btn-outline btn-view-details"
                            data-id="${order.id}"
                        >
                            Details
                        </button>

                        ${renderOrderActionsMarkup(order)}

                    </div>

                </td>

            `;

            list.appendChild(tr);

        });


        bindEvents();
    }


    // ============================================================
    // ASSIGN DELIVERY PERSON
    // ============================================================

    async function assignDeliveryPerson(orderId) {

        const select =
            document.querySelector(
                `.delivery-person-select[data-order-id="${orderId}"]`
            );

        if (!select) return;

        const deliveryPersonId =
            select.value;

        if (!deliveryPersonId) {

            LB.toast(
                'Please select a delivery person.',
                'warn'
            );

            return;
        }


        try {

            const response = await fetch(
                `/business/api/orders/${orderId}/assign-delivery-person`,
                {
                    method: 'PUT',

                    headers: {
                        'Content-Type': 'application/json'
                    },

                    body: JSON.stringify({
                        delivery_person_id:
                            Number(deliveryPersonId)
                    })
                }
            );


            const data =
                await response.json();


            if (!response.ok || !data.success) {

                throw new Error(
                    data.message ||
                    'Could not assign delivery person.'
                );
            }


            LB.toast(
                `${data.deliveryPerson.name} assigned to Order #${orderId}.`,
                'success'
            );


            await loadOrders();

        } catch (error) {

            console.error(
                'Assignment error:',
                error
            );

            LB.toast(
                error.message ||
                'Could not assign delivery person.',
                'error'
            );
        }
    }


    // ============================================================
    // STATUS UPDATE
    // ============================================================

    async function updateOrderStatus(orderId, newStatus) {

        try {

            const response = await fetch(
                `/business/api/orders/${orderId}/status`,
                {
                    method: 'PUT',

                    headers: {
                        'Content-Type': 'application/json'
                    },

                    body: JSON.stringify({
                        status: newStatus
                    })
                }
            );


            const data =
                await response.json();


            if (!response.ok || !data.success) {

                throw new Error(
                    data.message ||
                    'Could not update order status.'
                );
            }


            LB.toast(
                `Order #${orderId} updated to ${newStatus.replace(/_/g, ' ')}.`,
                'success'
            );


            await loadOrders();

        } catch (error) {

            console.error(
                'Status update error:',
                error
            );

            LB.toast(
                error.message ||
                'Could not update order.',
                'error'
            );
        }
    }


    // ============================================================
    // EVENT BINDING
    // ============================================================

    function bindEvents() {

        // Status buttons
        document
            .querySelectorAll('.btn-order-action')
            .forEach(button => {

                button.addEventListener(
                    'click',
                    () => {

                        const orderId =
                            button.dataset.id;

                        const newStatus =
                            button.dataset.action;

                        updateOrderStatus(
                            orderId,
                            newStatus
                        );
                    }
                );
            });


        // Assign buttons
        document
            .querySelectorAll('.btn-assign-delivery')
            .forEach(button => {

                button.addEventListener(
                    'click',
                    () => {

                        const orderId =
                            button.dataset.orderId;

                        assignDeliveryPerson(
                            orderId
                        );
                    }
                );
            });


        // Details
        document
            .querySelectorAll('.btn-view-details')
            .forEach(button => {

                button.addEventListener(
                    'click',
                    () => {

                        const orderId =
                            button.dataset.id;

                        openOrderDetails(
                            orderId
                        );
                    }
                );
            });
    }


    // ============================================================
    // DETAILS PANEL
    // ============================================================

    function openOrderDetails(orderId) {

        const order =
            orders.find(
                item =>
                    String(item.id) ===
                    String(orderId)
            );

        if (!order) return;


        const title =
            document.getElementById(
                'panelOrderTitle'
            );

        const body =
            document.getElementById(
                'panelOrderBody'
            );

        if (!title || !body) return;


        title.textContent =
            `Order # ${order.id}`;


        const itemsMarkup =
            (order.items || [])
                .map(item => `
                    <div style="
                        display:flex;
                        justify-content:space-between;
                        padding:8px 0;
                        border-bottom:1px solid var(--clr-border);
                    ">
                        <span>
                            ${item.name}
                            <strong
                                style="color:var(--clr-text-3)"
                            >
                                x ${item.qty}
                            </strong>
                        </span>

                        <strong>
                            ₹${item.price * item.qty}
                        </strong>
                    </div>
                `)
                .join('');


        const deliveryPersonBlock =
            order.deliveryPerson

                ? `
                    <div style="
                        margin-top:16px;
                        padding:12px;
                        background:#f7f7f7;
                        border-radius:9px;
                    ">

                        <div style="
                            font-size:11px;
                            font-weight:700;
                            color:#777;
                            text-transform:uppercase;
                        ">
                            Delivery Person
                        </div>

                        <div style="
                            margin-top:4px;
                            font-weight:700;
                        ">
                            ${order.deliveryPerson.name}
                        </div>

                        <div style="
                            margin-top:2px;
                            font-size:12px;
                            color:#777;
                        ">
                            ${order.deliveryPerson.phone}
                        </div>

                    </div>
                `

                : '';


        body.innerHTML = `

            <div style="
                background:var(--clr-surface);
                border-radius:var(--r-lg);
                padding:var(--sp-4);
                margin-bottom:var(--sp-5);
            ">

                <div style="
                    display:flex;
                    justify-content:space-between;
                ">

                    <span
                        style="
                            font-size:12px;
                            font-weight:700;
                            color:var(--clr-text-3);
                        "
                    >
                        STATUS
                    </span>

                    <span class="status-badge ${order.status}">
                        ${order.status.replace(/_/g, ' ')}
                    </span>

                </div>


                <div style="
                    display:flex;
                    justify-content:space-between;
                    margin-top:10px;
                ">

                    <span
                        style="
                            font-size:12px;
                            font-weight:700;
                            color:var(--clr-text-3);
                        "
                    >
                        FULFILLMENT
                    </span>

                    <span>
                        ${
                            String(order.deliveryType).toLowerCase()
                            === 'delivery'
                                ? '🚗 Delivery'
                                : '🏪 Pickup'
                        }
                    </span>

                </div>

            </div>


            <h4
                class="form-subtitle-sec"
                style="
                    font-size:13px;
                    text-transform:uppercase;
                    color:var(--clr-text-3);
                "
            >
                Ordered Items
            </h4>


            <div style="margin-bottom:20px;">
                ${itemsMarkup}
            </div>


            <div style="
                display:flex;
                justify-content:space-between;
                margin-bottom:20px;
            ">

                <span>
                    Total Amount
                </span>

                <strong style="font-size:22px;">
                    ₹${order.amount}
                </strong>

            </div>


            <h4
                class="form-subtitle-sec"
                style="
                    font-size:13px;
                    text-transform:uppercase;
                    color:var(--clr-text-3);
                "
            >
                Customer Details
            </h4>


            <div style="margin-top:10px;">

                <strong>
                    ${order.customer}
                </strong>

                <p style="
                    margin-top:4px;
                    color:var(--clr-text-2);
                ">
                    ${order.address || 'Address not available'}
                </p>

            </div>


            ${deliveryPersonBlock}

        `;


        document
            .getElementById(
                'orderDetailPanelOverlay'
            )
            ?.classList.add('active');
    }


    // ============================================================
    // CLOSE DETAILS
    // ============================================================

    document
        .getElementById('btnSlidePanelClose')
        ?.addEventListener(
            'click',
            () => {

                document
                    .getElementById(
                        'orderDetailPanelOverlay'
                    )
                    ?.classList.remove('active');
            }
        );


    // ============================================================
    // FILTER TABS
    // ============================================================

    document
        .querySelectorAll('.filter-tab-btn')
        .forEach(tab => {

            tab.addEventListener(
                'click',
                () => {

                    document
                        .querySelectorAll(
                            '.filter-tab-btn'
                        )
                        .forEach(t =>
                            t.classList.remove('active')
                        );

                    tab.classList.add('active');

                    activeFilter =
                        tab.dataset.status;

                    renderOrdersList();
                }
            );
        });


    // ============================================================
    // SEARCH
    // ============================================================

    document
        .getElementById('orderSearchInput')
        ?.addEventListener(
            'input',
            renderOrdersList
        );


    // ============================================================
    // INITIAL LOAD
    // ============================================================

    async function initialize() {

        await loadDeliveryPersons();

        await loadOrders();
    }

    initialize();

});