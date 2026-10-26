/**
 * ============================================================
 *  LocalBites — Dashboard Interactions (dashboard.js)
 *  Contains: Geolocation API, Manual Location Modals,
 *  Auto Banner Slider, Side Drawer Controls
 * ============================================================
 */

'use strict';

document.addEventListener('DOMContentLoaded', () => {

    const page = document.body.dataset.page;

    if (page !== 'location' && page !== 'dashboard') {
        return;
    }


    /* =========================================================
       PAGE 1: LOCATION CONFIRMATION FLOWS
       ========================================================= */

    if (page === 'location') {

        const btnAllow =
            document.getElementById('btnAllowLocation');

        const btnManual =
            document.getElementById('btnChooseManual');

        const manualModal =
            document.getElementById('manualLocationModal');

        const closeManual =
            document.getElementById('closeManualModal');

        const searchInput =
            document.getElementById('manualLocationSearch');

        const cityPills =
            document.querySelectorAll('.city-pill');

        const btnSave =
            document.getElementById('btnSaveLocation');

        const deniedModal =
            document.getElementById('locationDeniedModal');

        const btnDeniedOk =
            document.getElementById('btnDeniedOk');


        /* Allow location */

        btnAllow?.addEventListener('click', () => {

            LB.setLoading(btnAllow, true);

            if (navigator.geolocation) {

                navigator.geolocation.getCurrentPosition(

                    (pos) => {

                        const lat =
                            pos.coords.latitude;

                        const lng =
                            pos.coords.longitude;


                        fetch('/customer/update-location', {
                            method: 'POST',
                            headers: {
                                'Content-Type':
                                    'application/json'
                            },
                            body: JSON.stringify({
                                latitude: lat,
                                longitude: lng,
                                address:
                                    'Current Location (GPS)'
                            })
                        })

                        .then(res => res.json())

                        .then(data => {

                            LB.setLoading(
                                btnAllow,
                                false
                            );

                            if (data.success) {

                                sessionStorage.setItem(
                                    'lb_location',
                                    '📍 Current Location (GPS)'
                                );

                                LB.toast(
                                    'Location fetched via GPS successfully!',
                                    'success'
                                );

                                setTimeout(
                                    () =>
                                        LB.navigate(
                                            '/customer/dashboard'
                                        ),
                                    500
                                );

                            } else {

                                LB.toast(
                                    data.message ||
                                        'Could not save your location.',
                                    'error'
                                );
                            }

                        })

                        .catch(() => {

                            LB.setLoading(
                                btnAllow,
                                false
                            );

                            LB.toast(
                                'Could not save your location. Please try again.',
                                'error'
                            );
                        });
                    },

                    () => {

                        LB.setLoading(
                            btnAllow,
                            false
                        );

                        LB.openModal(
                            'locationDeniedModal'
                        );
                    },

                    {
                        timeout: 6000
                    }
                );

            } else {

                LB.setLoading(
                    btnAllow,
                    false
                );

                LB.toast(
                    'Geolocation not supported by your browser.',
                    'warn'
                );

                LB.openModal(
                    'manualLocationModal'
                );
            }
        });


        /* Open manual location modal */

        btnManual?.addEventListener(
            'click',
            () => {
                LB.openModal(
                    'manualLocationModal'
                );
            }
        );


        /* Close manual location modal */

        closeManual?.addEventListener(
            'click',
            () => {
                LB.closeModal(
                    'manualLocationModal'
                );
            }
        );


        /* City pills */

        cityPills.forEach(pill => {

            pill.addEventListener(
                'click',
                () => {

                    cityPills.forEach(p =>
                        p.classList.remove('active')
                    );

                    pill.classList.add('active');

                    if (searchInput) {
                        searchInput.value =
                            pill.textContent;
                    }
                }
            );
        });


        /* Save manual location */

        btnSave?.addEventListener(
            'click',
            () => {

                const val =
                    searchInput
                        ? searchInput.value.trim()
                        : '';

                if (!val) {

                    LB.toast(
                        'Please choose or enter a location',
                        'error'
                    );

                    return;
                }


                sessionStorage.setItem(
                    'lb_location',
                    `📍 ${val}`
                );


                LB.toast(
                    'Location set successfully!',
                    'success'
                );


                LB.closeModal(
                    'manualLocationModal'
                );


                setTimeout(
                    () =>
                        LB.navigate(
                            '/customer/dashboard'
                        ),
                    300
                );
            }
        );
    }


    /* =========================================================
       PAGE 2: DASHBOARD FLOWS
       ========================================================= */

    if (page === 'dashboard') {


        /* =====================================================
           PROFILE AVATAR
           ===================================================== */

        const profileAvatar =
            document.getElementById('profileAvatar');

        if (
            profileAvatar &&
            window.LB_PROFILE
        ) {

            const userProfile =
                LB_PROFILE.getState().profile;

            if (
                userProfile &&
                userProfile.fullName
            ) {

                const initial =
                    userProfile.fullName
                        .trim()
                        .charAt(0)
                        .toUpperCase();

                const span =
                    profileAvatar.querySelector('span') ||
                    profileAvatar;

                span.textContent =
                    initial;
            }
        }


        /* =====================================================
           LOCATION LABEL
           ===================================================== */

        const savedLoc =
            sessionStorage.getItem(
                'lb_location'
            ) ||
            '📍 Choose Location...';

        const locLabel =
            document.getElementById(
                'dashboardLocName'
            );

        if (locLabel) {

            locLabel.textContent =
                savedLoc.replace(
                    '📍 ',
                    ''
                );
        }


        /* =====================================================
           LOCATION MODAL
           ===================================================== */

        const changeLocBtn =
            document.getElementById(
                'changeLocationBtn'
            );

        const manualModal =
            document.getElementById(
                'manualLocationModal'
            );

        const closeManual =
            document.getElementById(
                'closeManualModal'
            );

        const searchInput =
            document.getElementById(
                'manualLocationSearch'
            );

        const cityPills =
            document.querySelectorAll(
                '.city-pill'
            );

        const btnSave =
            document.getElementById(
                'btnSaveLocation'
            );


        changeLocBtn?.addEventListener(
            'click',
            () => {

                LB.openModal(
                    'manualLocationModal'
                );

                if (
                    locLabel &&
                    searchInput
                ) {

                    searchInput.value =
                        locLabel.textContent;
                }
            }
        );


        closeManual?.addEventListener(
            'click',
            () => {

                LB.closeModal(
                    'manualLocationModal'
                );
            }
        );


        cityPills.forEach(pill => {

            pill.addEventListener(
                'click',
                () => {

                    cityPills.forEach(p =>
                        p.classList.remove(
                            'active'
                        )
                    );

                    pill.classList.add(
                        'active'
                    );

                    if (searchInput) {

                        searchInput.value =
                            pill.textContent;
                    }
                }
            );
        });


        btnSave?.addEventListener(
            'click',
            () => {

                const val =
                    searchInput
                        ? searchInput.value.trim()
                        : '';

                if (!val) {

                    LB.toast(
                        'Please select or type a location',
                        'error'
                    );

                    return;
                }


                sessionStorage.setItem(
                    'lb_location',
                    `📍 ${val}`
                );


                if (locLabel) {

                    locLabel.textContent =
                        val;
                }


                LB.toast(
                    'Location updated!',
                    'success'
                );


                LB.closeModal(
                    'manualLocationModal'
                );
            }
        );


        /* =====================================================
           NOTIFICATIONS
           ===================================================== */

        document
            .getElementById('notifBell')
            ?.addEventListener(
                'click',
                () => {

                    LB.toast(
                        'You have no new notifications.',
                        'info'
                    );
                }
            );


        /* =====================================================
           PROFILE
           ===================================================== */

        document
            .getElementById('profileAvatar')
            ?.addEventListener(
                'click',
                () => {

                    LB.navigate(
                        '/customer/profile'
                    );
                }
            );


        /* =====================================================
           SIDE DRAWER
           ===================================================== */

        const menuTrigger =
            document.getElementById(
                'menuTrigger'
            );

        const sideDrawer =
            document.getElementById(
                'sideDrawer'
            );

        const drawerOverlay =
            document.getElementById(
                'drawerOverlay'
            );

        const closeDrawerBtn =
            document.getElementById(
                'closeDrawerBtn'
            );


        const openDrawer = () => {

            sideDrawer?.classList.add(
                'active'
            );

            drawerOverlay?.classList.add(
                'active'
            );

            document.body.style.overflow =
                'hidden';
        };


        const closeDrawer = () => {

            sideDrawer?.classList.remove(
                'active'
            );

            drawerOverlay?.classList.remove(
                'active'
            );

            document.body.style.overflow =
                '';
        };


        menuTrigger?.addEventListener(
            'click',
            openDrawer
        );


        closeDrawerBtn?.addEventListener(
            'click',
            closeDrawer
        );


        drawerOverlay?.addEventListener(
            'click',
            closeDrawer
        );


        document.addEventListener(
            'keydown',
            (e) => {

                if (
                    e.key === 'Escape' &&
                    sideDrawer?.classList.contains(
                        'active'
                    )
                ) {

                    closeDrawer();
                }
            }
        );


        /* =====================================================
           FEATURED BANNER SLIDER
           ===================================================== */

        const track =
            document.getElementById(
                'bannerTrack'
            );

        const slides =
            document.querySelectorAll(
                '.banner-slide'
            );

        const dots =
            document.querySelectorAll(
                '.banner-dot'
            );


        let currentSlide = 0;

        const totalSlides =
            slides.length;


        /*
         * IMPORTANT
         *
         * The CSS uses:
         *
         * track = 100% viewport width
         * each slide = 100% viewport width
         *
         * Therefore:
         *
         * Slide 1 = 0%
         * Slide 2 = -100%
         * Slide 3 = -200%
         * Slide 4 = -300%
         *
         * Do NOT divide by totalSlides.
         */


        const updateBanner = (index) => {

            if (
                !track ||
                totalSlides === 0
            ) {
                return;
            }


            /* Keep index inside valid range */

            if (index < 0) {

                index =
                    totalSlides - 1;
            }


            if (
                index >= totalSlides
            ) {

                index = 0;
            }


            /*
             * Move exactly ONE complete
             * panel for every index.
             */

            const movement =
                index * 100;


            track.style.transform =
                `translate3d(-${movement}%, 0, 0)`;


            /* Update dots */

            dots.forEach(
                (dot, idx) => {

                    dot.classList.toggle(
                        'active',
                        idx === index
                    );
                }
            );


            currentSlide =
                index;
        };


        /* =====================================================
           BANNER IMAGES
           ===================================================== */

const bannerImages = [
    '/static/images/food/homecookedmeal.png',
    '/static/images/food/lowdiet.png',
    '/static/images/food/student.png',
    '/static/images/food/festivalsweet.png'
];

const bannerPositions = [
    'center center',
    'center center',
    'center center',
    'center center'
];

slides.forEach((slide, index) => {
    const image = bannerImages[index];

    if (!image) return;

    // Set the slide background
    slide.style.backgroundImage = `url("${image}")`;
    slide.style.backgroundSize = 'cover';
    slide.style.backgroundRepeat = 'no-repeat';
    slide.style.backgroundPosition = bannerPositions[index];

    // Also update the actual <img class="banner-bg"> if it exists
    const bgImage = slide.querySelector('.banner-bg');

    if (bgImage) {
        bgImage.src = image;
        bgImage.style.display = 'block';
        bgImage.style.width = '100%';
        bgImage.style.height = '100%';
        bgImage.style.objectFit = 'cover';
        bgImage.style.objectPosition = bannerPositions[index];
    }
});


        /* =====================================================
           DOT CLICK
           ===================================================== */

        dots.forEach(
            (dot, index) => {

                dot.addEventListener(
                    'click',
                    () => {

                        updateBanner(
                            index
                        );
                    }
                );
            }
        );


        /* =====================================================
           INITIAL SLIDE
           ===================================================== */

        updateBanner(0);


        /* =====================================================
           AUTOMATIC SLIDE
           ===================================================== */

        if (
            track &&
            totalSlides > 1
        ) {

            setInterval(
                () => {

                    const nextSlide =
                        (
                            currentSlide + 1
                        ) % totalSlides;


                    updateBanner(
                        nextSlide
                    );

                },
                4500
            );
        }


        /* =====================================================
           CATEGORY REDIRECTS
           ===================================================== */

        const categoryCards =
            document.querySelectorAll(
                '.cat-card'
            );


        categoryCards.forEach(
            card => {

                card.addEventListener(
                    'click',
                    () => {

                        const type =
                            card.dataset.category;


                        if (type) {

                            sessionStorage.setItem(
                                'selected_category',
                                type
                            );

                            // Change this from LB.navigate to standard window.location.href
                            window.location.href = `/customer/search?category=${encodeURIComponent(type)}`;
                        }
                    }
                );
            }
        );
        
        /* =====================================================
           DASHBOARD SEARCH
           ===================================================== */

        const dashboardSearch =
            document.getElementById(
                'dashboardSearch'
            );


        dashboardSearch?.addEventListener(
            'focus',
            () => {

                LB.navigate(
                    '/customer/search'
                );
            }
        );
    }
});