/**
 * ============================================================
 * LocalBites — Delivery & Fulfillment Controller
 * Connected to real Flask + MySQL backend
 * ============================================================
 */

'use strict';

document.addEventListener('DOMContentLoaded', () => {

    const page = document.body.dataset.page;

    if (page !== 'delivery') return;

    LB_Biz.initCommonUI('delivery');


    // ============================================================
    // BUSINESS SERVICES
    // ============================================================

    let businessServices = {
        delivery: false,
        selfPickup: false
    };


    // ============================================================
    // DELIVERY PERSONS
    // ============================================================

    let deliveryPersons = [];


    // ============================================================
    // LOAD BUSINESS SERVICES
    // ============================================================

    const loadBusinessServices = async () => {

        try {

            const response = await fetch(
                '/business/api/profile'
            );

            const data = await response.json();

            console.log(
                'Business profile response:',
                data
            );


            if (!response.ok || !data.success) {

                console.error(
                    'Could not load business profile:',
                    data.message
                );

                return;
            }


            businessServices =
                data.business?.services || {
                    delivery: false,
                    selfPickup: false
                };


            console.log(
                'Business services:',
                businessServices
            );


        } catch (error) {

            console.error(
                'Error loading business services:',
                error
            );

        }

    };


    // ============================================================
    // LOAD DELIVERY PERSONS FROM MYSQL
    // ============================================================

    const loadDeliveryPersons = async () => {

        try {

            const response = await fetch(
                '/business/api/delivery-persons'
            );

            const data = await response.json();

            console.log(
                'Delivery persons response:',
                data
            );


            if (!response.ok || !data.success) {

                console.error(
                    'Could not load delivery persons:',
                    data.message
                );

                deliveryPersons = [];

                return;
            }


            deliveryPersons =
                data.deliveryPersons || [];


            console.log(
                'Available delivery persons:',
                deliveryPersons
            );


        } catch (error) {

            console.error(
                'Error loading delivery persons:',
                error
            );

            deliveryPersons = [];

        }

    };


    // ============================================================
    // LOAD REAL ORDERS FROM MYSQL
    // ============================================================

    let orders = [];


    const loadOrders = async () => {

        try {

            const response = await fetch(
                '/business/api/orders'
            );

            const data = await response.json();

            console.log(
                'Business orders response:',
                data
            );


            if (!response.ok || !data.success) {

                console.error(
                    'Could not load orders:',
                    data.message
                );

                orders = [];

                return;
            }


            orders = data.orders || [];


            console.log(
                'Real business orders:',
                orders
            );


        } catch (error) {

            console.error(
                'Error loading business orders:',
                error
            );

            orders = [];

        }

    };


    // ============================================================
    // DELIVERY SETTINGS
    // ============================================================

    const syncDeliverySettings = () => {

        const disabledBanner =
            document.getElementById(
                'deliveryDisabledBanner'
            );

        const statsHeader =
            document.getElementById(
                'deliveryStatsHeader'
            );


        if (!disabledBanner || !statsHeader) {
            return;
        }


        const available =
            businessServices.delivery;


        if (!available) {

            disabledBanner.classList.remove(
                'hidden'
            );

            statsHeader.style.display = 'none';

        } else {

            disabledBanner.classList.add(
                'hidden'
            );

            statsHeader.style.display = 'grid';

        }

    };


    // ============================================================
    // DELIVERY PERSON DROPDOWN
    // ============================================================

    const renderDeliveryPersonSelector = (order) => {

        if (
            order.deliveryType !== 'delivery'
        ) {
            return '';
        }


        const currentPersonId =
            order.deliveryPerson?.id
                ? String(order.deliveryPerson.id)
                : '';


        const options = deliveryPersons.map(person => {

            const selected =
                String(person.id) === currentPersonId
                    ? 'selected'
                    : '';


            return `
                <option
                    value="${person.id}"
                    ${selected}
                >
                    ${person.name}
                </option>
            `;

        }).join('');


        if (deliveryPersons.length === 0) {

            return `
                <div
                    style="
                        font-size: 12px;
                        color: #888;
                    "
                >
                    No delivery persons available
                </div>
            `;

        }


        return `
            <div
                style="
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                    min-width: 150px;
                "
            >

                <select
                    class="delivery-person-select"
                    data-order-id="${order.id}"
                    style="
                        padding: 6px 8px;
                        border: 1px solid #ddd;
                        border-radius: 6px;
                        font-size: 12px;
                        background: white;
                    "
                >

                    <option value="">
                        Select delivery person
                    </option>

                    ${options}

                </select>


                <button
                    type="button"
                    class="btn btn-xs btn-primary btn-assign-delivery"
                    data-id="${order.id}"
                >
                    Assign
                </button>

            </div>
        `;

    };


    // ============================================================
    // ASSIGN DELIVERY PERSON
    // ============================================================

    const assignDeliveryPerson = async (
        orderId,
        deliveryPersonId,
        button
    ) => {

        if (!deliveryPersonId) {

            LB.toast(
                'Please select a delivery person.',
                'error'
            );

            return;
        }


        try {

            if (button) {
                button.disabled = true;
                button.textContent = 'Assigning...';
            }


            const response = await fetch(
                `/business/api/orders/${orderId}/assign-delivery-person`,
                {
                    method: 'PUT',

                    headers: {
                        'Content-Type':
                            'application/json'
                    },

                    body: JSON.stringify({
                        delivery_person_id:
                            Number(deliveryPersonId)
                    })
                }
            );


            const data =
                await response.json();


            console.log(
                'Assign delivery person response:',
                data
            );


            if (
                !response.ok ||
                !data.success
            ) {

                LB.toast(
                    data.message ||
                    'Could not assign delivery person.',
                    'error'
                );

                return;
            }


            LB.toast(
                data.message ||
                'Delivery person assigned successfully.',
                'success'
            );


            /*
             * Reload orders from MySQL.
             * This also updates the selected delivery person.
             */

            await loadOrders();

            renderFulfillmentList();


        } catch (error) {

            console.error(
                'Error assigning delivery person:',
                error
            );


            LB.toast(
                'Something went wrong while assigning the delivery person.',
                'error'
            );


        } finally {

            if (button) {
                button.disabled = false;
                button.textContent = 'Assign';
            }

        }

    };


    // ============================================================
    // RENDER FULFILLMENT QUEUE
    // ============================================================

    const renderFulfillmentList = () => {

        const list =
            document.getElementById(
                'deliveryMainList'
            );

        const table =
            document.getElementById(
                'deliveryMainTable'
            );

        const emptyState =
            document.getElementById(
                'deliveryEmptyState'
            );


        if (!list || !table || !emptyState) {
            return;
        }


        /*
         * Only show orders relevant to fulfillment.
         */

        let activeOrders = orders.filter(order =>
            [
                'preparing',
                'ready',
                'out_for_delivery'
            ].includes(order.status)
        );


        /*
         * If business delivery is disabled,
         * only show pickup orders.
         */

        if (!businessServices.delivery) {

            activeOrders = activeOrders.filter(
                order =>
                    order.deliveryType === 'pickup'
            );

        }


        list.innerHTML = '';


        if (activeOrders.length === 0) {

            table.style.display = 'none';

            emptyState.classList.remove(
                'hidden'
            );

            return;
        }


        table.style.display = 'table';

        emptyState.classList.add(
            'hidden'
        );


        activeOrders.forEach(order => {

            const tr =
                document.createElement('tr');


            const isDelivery =
                order.deliveryType === 'delivery';


            const optionText =
                isDelivery
                    ? '🚗 Business Delivery'
                    : '🏪 Self Pickup';


            const optionClass =
                isDelivery
                    ? 'delivery'
                    : '';


            const addressText =
                isDelivery
                    ? (
                        order.address ||
                        'Address unavailable'
                    )
                    : 'Self pickup at kitchen location';


            const statusText =
                String(order.status || '')
                    .replace(/_/g, ' ');


            /*
             * Delivery person section
             */

            const deliveryPersonHTML =
                isDelivery
                    ? renderDeliveryPersonSelector(order)
                    : '';


            tr.innerHTML = `

                <td data-label="Order ID">

                    <strong>
                        #${order.id}
                    </strong>

                </td>


                <td data-label="Customer">

                    ${order.customer || 'Customer'}

                </td>


                <td data-label="Option">

                    <span class="opt-badge ${optionClass}">

                        ${optionText}

                    </span>

                </td>


                <td
                    data-label="Address / Info"
                    style="
                        font-size: var(--fs-13);
                        max-width: 150px;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                    "
                >

                    ${addressText}

                </td>


                <td data-label="Fulfillment Status">

                    <span class="status-badge ${order.status}">

                        ${statusText}

                    </span>

                </td>


                <td data-label="Delivery Person">

                    ${deliveryPersonHTML}

                </td>


                <td data-label="Action">

                    <div class="action-btn-group">

                        ${renderFulfillmentActions(order)}

                    </div>

                </td>

            `;


            list.appendChild(tr);

        });


        bindFulfillmentActions();

        bindDeliveryPersonActions();

    };


    // ============================================================
    // RENDER ACTION BUTTONS
    // ============================================================

    const renderFulfillmentActions = (order) => {

        /*
         * PREPARING → READY
         */

        if (order.status === 'preparing') {

            return `
                <button
                    class="btn btn-xs btn-primary btn-fulfill"
                    data-id="${order.id}"
                    data-action="ready"
                >
                    Mark Ready
                </button>
            `;

        }


        /*
         * READY → OUT FOR DELIVERY
         */

        if (
            order.status === 'ready' &&
            order.deliveryType === 'delivery'
        ) {

            return `
                <button
                    class="btn btn-xs btn-primary btn-fulfill"
                    data-id="${order.id}"
                    data-action="dispatch"
                >
                    Mark Out for Delivery
                </button>
            `;

        }


        /*
         * OUT FOR DELIVERY → DELIVERED
         */

        if (
            order.status === 'out_for_delivery'
        ) {

            return `
                <button
                    class="btn btn-xs btn-secondary btn-fulfill"
                    data-id="${order.id}"
                    data-action="delivered"
                >
                    Mark Delivered
                </button>
            `;

        }


        return '';

    };


    // ============================================================
    // BIND DELIVERY PERSON BUTTONS
    // ============================================================

    const bindDeliveryPersonActions = () => {

        document
            .querySelectorAll('.btn-assign-delivery')
            .forEach(button => {

                button.addEventListener(
                    'click',
                    () => {

                        const orderId =
                            button.dataset.id;


                        const select =
                            document.querySelector(
                                `.delivery-person-select[data-order-id="${orderId}"]`
                            );


                        if (!select) {
                            return;
                        }


                        const deliveryPersonId =
                            select.value;


                        assignDeliveryPerson(
                            orderId,
                            deliveryPersonId,
                            button
                        );

                    }
                );

            });

    };


    // ============================================================
    // BIND FULFILLMENT BUTTONS
    // ============================================================

    const bindFulfillmentActions = () => {

        document
            .querySelectorAll('.btn-fulfill')
            .forEach(button => {

                button.addEventListener(
                    'click',
                    () => {

                        const orderId =
                            button.dataset.id;


                        const action =
                            button.dataset.action;


                        handleFulfillmentTransition(
                            orderId,
                            action
                        );

                    }
                );

            });

    };


    // ============================================================
    // UPDATE REAL DATABASE ORDER STATUS
    // ============================================================

    const handleFulfillmentTransition = async (
        orderId,
        action
    ) => {

        let newStatus = '';

        let toastMessage = '';


        if (action === 'ready') {

            newStatus = 'ready';

            toastMessage =
                `Order #${orderId} is now ready.`;

        }


        else if (action === 'dispatch') {

            newStatus =
                'out_for_delivery';

            toastMessage =
                `Order #${orderId} is out for delivery.`;

        }


        else if (action === 'delivered') {

            newStatus =
                'delivered';

            toastMessage =
                `Order #${orderId} has been delivered.`;

        }


        if (!newStatus) {
            return;
        }


        try {

            const response = await fetch(
                `/business/api/orders/${orderId}/status`,
                {
                    method: 'PUT',

                    headers: {
                        'Content-Type':
                            'application/json'
                    },

                    body: JSON.stringify({
                        status: newStatus
                    })
                }
            );


            const data =
                await response.json();


            console.log(
                'Status update response:',
                data
            );


            if (
                !response.ok ||
                !data.success
            ) {

                LB.toast(
                    data.message ||
                    'Could not update order status.',
                    'error'
                );

                return;
            }


            LB.toast(
                toastMessage,
                'success'
            );


            await loadOrders();

            renderFulfillmentList();


        } catch (error) {

            console.error(
                'Error updating order status:',
                error
            );


            LB.toast(
                'Something went wrong while updating the order.',
                'error'
            );

        }

    };


    // ============================================================
    // START
    // ============================================================

    (async () => {

        await loadBusinessServices();

        await loadDeliveryPersons();

        await loadOrders();

        syncDeliverySettings();

        renderFulfillmentList();

    })();

});