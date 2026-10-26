document.addEventListener("DOMContentLoaded", () => {
    if (window.LB_Biz) {
        window.LB_Biz.initCommonUI("delivery-persons");
    }
    const tableBody = document.getElementById("deliveryPersonsTableBody");
    const emptyState = document.getElementById("deliveryPersonsEmpty");

    const addButton = document.getElementById("addDeliveryPersonBtn");
    const modal = document.getElementById("deliveryPersonModal");
    const closeButton = document.getElementById("closeDeliveryPersonModal");
    const cancelButton = document.getElementById("cancelDeliveryPersonBtn");
    const form = document.getElementById("deliveryPersonForm");
    const modalTitle = document.getElementById("deliveryPersonModalTitle");
    const modalDescription = document.getElementById("deliveryPersonModalDescription");
    const submitButton = document.getElementById("deliveryPersonSubmitBtn");
    const passwordHint = document.getElementById("deliveryPersonPasswordHint");
    const passwordInput = document.getElementById("deliveryPersonPassword");

    let editingDeliveryPersonId = null;
    let deliveryPersonsCache = [];

    loadDeliveryPersons();


    // ==========================================
    // LOAD DELIVERY PERSONS
    // ==========================================

    async function loadDeliveryPersons() {
        try {
            const response = await fetch("/business/api/delivery-persons", {
                method: "GET",
                headers: { "Accept": "application/json" }
            });
            const data = await readJson(response);

            if (!response.ok || !data.success) {
                throw new Error(data.message || "Failed to load delivery persons.");
            }

            deliveryPersonsCache = data.deliveryPersons || [];
            renderDeliveryPersons(deliveryPersonsCache);
        } catch (error) {
            console.error("Error loading delivery persons:", error);

            if (tableBody) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="5" class="text-secondary">
                            Unable to load delivery persons.
                        </td>
                    </tr>
                `;
            }
        }
    }


    // ==========================================
    // RENDER DELIVERY PERSONS
    // ==========================================

    function renderDeliveryPersons(deliveryPersons) {
        if (!tableBody) return;

        tableBody.innerHTML = "";

        if (!deliveryPersons || deliveryPersons.length === 0) {
            if (emptyState) emptyState.classList.remove("hidden");
            return;
        }

        if (emptyState) emptyState.classList.add("hidden");

        deliveryPersons.forEach(person => {
            const row = document.createElement("tr");

            row.innerHTML = `
                <td><strong>${escapeHtml(person.name)}</strong></td>
                <td>${escapeHtml(person.phone)}</td>
                <td>${escapeHtml(person.username)}</td>
                <td>
                    <span class="status-badge success">Active</span>
                </td>
                <td>
                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                        <button
                            type="button"
                            class="btn btn-secondary manage-delivery-person-btn"
                            data-action="edit"
                            data-id="${person.id}">
                            Edit
                        </button>
                        <button
                            type="button"
                            class="btn manage-delivery-person-btn"
                            data-action="delete"
                            data-id="${person.id}"
                            style="background:#dc3545; color:#ffffff; border:1px solid #dc3545;">
                            Delete
                        </button>
                    </div>
                </td>
            `;

            tableBody.appendChild(row);
        });
    }


    // ==========================================
    // OPEN ADD / EDIT MODAL
    // ==========================================

    function openAddModal() {
        editingDeliveryPersonId = null;

        if (modalTitle) modalTitle.textContent = "Add Delivery Person";
        if (modalDescription) {
            modalDescription.textContent = "Enter the details of the new delivery person.";
        }
        if (submitButton) submitButton.textContent = "Add Delivery Person";
        if (passwordInput) passwordInput.required = true;
        if (passwordHint) passwordHint.textContent = "Minimum 6 characters.";

        if (form) form.reset();
        if (modal) { modal.classList.remove("hidden"); modal.classList.add("active"); }
    }


    function openEditModal(person) {
        editingDeliveryPersonId = Number(person.id);

        if (modalTitle) modalTitle.textContent = "Update Delivery Person";
        if (modalDescription) {
            modalDescription.textContent = "Update the delivery person's details. Leave password blank to keep the current password.";
        }
        if (submitButton) submitButton.textContent = "Save Changes";
        if (passwordInput) passwordInput.required = false;
        if (passwordHint) passwordHint.textContent = "Optional. Leave blank to keep the current password.";

        document.getElementById("deliveryPersonName").value = person.name || "";
        document.getElementById("deliveryPersonPhone").value = person.phone || "";
        document.getElementById("deliveryPersonUsername").value = person.username || "";
        document.getElementById("deliveryPersonPassword").value = "";

        if (modal) { modal.classList.remove("hidden"); modal.classList.add("active"); }
    }



    // ==========================================
    // OPEN MODAL
    // ==========================================

    if (addButton) {
        addButton.addEventListener("click", (event) => {
            event.preventDefault();
            openAddModal();
        });
    }


    // ==========================================
    // TABLE ACTIONS — EDIT / DELETE
    // ==========================================

    if (tableBody) {
        tableBody.addEventListener("click", async (event) => {
            const button = event.target.closest(".manage-delivery-person-btn");
            if (!button) return;

            const id = Number(button.dataset.id);
            const action = button.dataset.action;
            const person = deliveryPersonsCache.find(item => Number(item.id) === id);

            if (!person) return;

            if (action === "edit") {
                openEditModal(person);
                return;
            }

            if (action === "delete") {
                const confirmed = window.confirm(
                    `Remove ${person.name} from your delivery team?\n\nThey will no longer be able to log in or receive new orders. Existing order history will be preserved.`
                );

                if (!confirmed) return;

                try {
                    const response = await fetch(
                        `/business/api/delivery-persons/${encodeURIComponent(id)}`,
                        { method: "DELETE", headers: { "Accept": "application/json" } }
                    );
                    const data = await readJson(response);

                    if (!response.ok || !data.success) {
                        throw new Error(data.message || "Failed to remove delivery person.");
                    }

                    alert(data.message || "Delivery person removed successfully.");
                    await loadDeliveryPersons();
                } catch (error) {
                    console.error("Error deleting delivery person:", error);
                    alert(error.message || "Something went wrong while removing the delivery person.");
                }
            }
        });
    }


    // ==========================================
    // CLOSE MODAL
    // ==========================================

    function closeModal() {
        if (modal) { modal.classList.remove("active"); modal.classList.add("hidden"); }
        if (form) form.reset();
        editingDeliveryPersonId = null;
        if (passwordInput) passwordInput.required = true;
    }

    if (closeButton) closeButton.addEventListener("click", closeModal);
    if (cancelButton) cancelButton.addEventListener("click", closeModal);

    // Close when clicking the dark backdrop (but not the modal box itself).
    if (modal) {
        modal.addEventListener("click", (event) => {
            if (event.target === modal) closeModal();
        });
    }

    // Allow Escape to close the modal.
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && modal && modal.classList.contains("active")) {
            closeModal();
        }
    });


    // ==========================================
    // SUBMIT ADD / UPDATE FORM
    // ==========================================

    if (form) {
        form.addEventListener("submit", async (event) => {
            event.preventDefault();

            const name = document.getElementById("deliveryPersonName").value.trim();
            const phone = document.getElementById("deliveryPersonPhone").value.trim();
            const username = document.getElementById("deliveryPersonUsername").value.trim();
            const password = document.getElementById("deliveryPersonPassword").value;

            if (!name || !phone || !username || (!editingDeliveryPersonId && !password)) {
                alert("Please fill all required fields.");
                return;
            }

            if (!editingDeliveryPersonId && password.length < 6) {
                alert("Password must be at least 6 characters.");
                return;
            }

            if (editingDeliveryPersonId && password && password.length < 6) {
                alert("Password must be at least 6 characters.");
                return;
            }

            const isEditing = Boolean(editingDeliveryPersonId);
            const endpoint = isEditing
                ? `/business/api/delivery-persons/${encodeURIComponent(editingDeliveryPersonId)}`
                : "/business/api/delivery-persons";

            const payload = { name, phone, username };
            if (password) payload.password = password;

            if (submitButton) submitButton.disabled = true;

            try {
                const response = await fetch(endpoint, {
                    method: isEditing ? "PUT" : "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Accept": "application/json"
                    },
                    body: JSON.stringify(payload)
                });

                const data = await readJson(response);

                if (!response.ok || !data.success) {
                    throw new Error(data.message || (isEditing
                        ? "Failed to update delivery person."
                        : "Failed to add delivery person."));
                }

                alert(data.message || (isEditing
                    ? "Delivery person updated successfully."
                    : "Delivery person added successfully."));

                closeModal();
                await loadDeliveryPersons();
            } catch (error) {
                console.error("Error saving delivery person:", error);
                alert(error.message || "Something went wrong while saving the delivery person.");
            } finally {
                if (submitButton) submitButton.disabled = false;
            }
        });
    }



    // ==========================================
    // SAFE JSON READER
    // If the server answers with an HTML error page (500, expired login
    // redirect, etc.) response.json() throws a cryptic "Unexpected token <".
    // This turns that into a readable message instead.
    // ==========================================

    async function readJson(response) {
        const text = await response.text();

        try {
            return JSON.parse(text);
        } catch (error) {
            if (response.redirected || response.status === 401 || response.status === 403) {
                throw new Error("Your session has expired. Please log in again.");
            }
            throw new Error(`Server error (${response.status}). Please try again.`);
        }
    }


    // ==========================================
    // ESCAPE HTML
    // ==========================================

    function escapeHtml(value) {

        if (value === null || value === undefined) {
            return "";
        }

        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

});