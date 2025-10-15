document.addEventListener('DOMContentLoaded', () => {
    const CATALOG_URL = '../catalog/netCatalog.json';

    const categoriesEl = document.getElementById('categories');
    const panelContent = document.getElementById('panelContent');
    const breadcrumb = document.getElementById('breadcrumb');
    const filterInput = document.getElementById('filterInput');
    const globalSearch = document.getElementById('globalSearch');
    const catalogInfoEl = document.getElementById('catalogInfo');
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modalTitle');
    const modalSub = document.getElementById('modalSub');
    const modalBody = document.getElementById('modalBody');
    const modalClose = document.getElementById('modalClose');
    const themeSwitch = document.getElementById('themeSwitch');

    let catalogData = {};
    let itemsByCategory = {};
    let itemsByKey = {}; // For quick lookups
    let currentCategory = null;

    function escapeHtml(s) { return String(s || '').replace(/[&<>()"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '(': '&#40;', ')': '&#41;', '"': '&quot;', "'": '&#39;' }[c])); }
    function escapeForJs(s) { return (s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\"').replace(/\n/g, '\\n'); }

    function normItem(item) {
        // If the key is a number, format it as a hex string for better readability
        if (typeof item.key === 'number') {
            item.key = `0x${item.key.toString(16).toUpperCase()}`;
        }
        return item;
    }

    function groupItemsByCategory(items) {
        const grouped = {};
        items.forEach(item => {
            const category = (item.category && item.category[0]) || 'CATEGORY_UNKNOWN';
            if (!grouped[category]) {
                grouped[category] = [];
            }
            grouped[category].push(normItem(item));
        });
        return grouped;
    }

    function mapItemsByKey(items) {
        return items.reduce((acc, item) => (acc[item.key] = normItem(item), acc), {});
    }

    async function loadCatalog() {
        categoriesEl.innerHTML = 'Downloading...';
        try {
            const res = await fetch(CATALOG_URL);
            if (!res.ok) throw new Error('HTTP ' + res.status);

            catalogData = await res.json();
            itemsByCategory = groupItemsByCategory(catalogData.items);
            itemsByKey = mapItemsByKey(catalogData.items);

            if (catalogInfoEl) {
                catalogInfoEl.textContent = `v${catalogData.version} / ${catalogData.numberItems} items`;
            }
            renderCategories();
        } catch (e) {
            categoriesEl.innerHTML = `<div style="color:orange">Error: ${escapeHtml(e.message)}</div>`;
            panelContent.innerHTML = `<div style="color:var(--muted)">Could not load catalog file.</div>`;
        }
    }

    function updatePanelContent(htmlGenerator) {
        if (panelContent.classList.contains('panel-fade-out')) return;

        panelContent.classList.add('panel-fade-out');
        setTimeout(() => {
            panelContent.innerHTML = htmlGenerator();
            panelContent.classList.remove('panel-fade-out');
            requestAnimationFrame(() => document.querySelectorAll('.native-row.enter').forEach((el, i) => setTimeout(() => el.classList.remove('enter'), i * 30)));
        }, 150);
    }

    function renderCategories(filter = '') {
        const filterLower = filter.toLowerCase();
        breadcrumb.textContent = 'Categories';
        currentCategory = null;

        const allCategories = Object.keys(itemsByCategory).sort();
        const filteredCategories = filter ? allCategories.filter(cat => cat.toLowerCase().includes(filterLower)) : allCategories;

        updatePanelContent(() => '<div class="ns-grid">' + filteredCategories.map(cat => {
            const count = itemsByCategory[cat].length;
            return `<div class="ns-card" data-cat="${cat}" onclick="selectCategory('${cat}')"><h3>${escapeHtml(cat.replace('CATEGORY_', ''))}</h3><p>${count} items</p></div>`;
        }).join('') + '</div>');

        const catListHtml = filteredCategories.map(cat => {
            const count = itemsByCategory[cat].length;
            return `<div class="ns-item" role="button" data-cat="${cat}">
                <div>
                    <div class="ns-name">${escapeHtml(cat.replace('CATEGORY_', ''))}</div>
                    <div class="ns-count">${count} items</div>
                </div>
                <div style="font-size:12px;color:var(--muted)">></div>
            </div>`;
        }).join('');
        categoriesEl.innerHTML = catListHtml || '<div style="color:var(--muted); padding: 0 16px;">No categories found.</div>';

        document.querySelectorAll('.ns-item').forEach(el => {
            el.addEventListener('click', () => selectCategory(el.dataset.cat));
        });
    }

    window.selectCategory = function (cat) {
        currentCategory = cat;
        breadcrumb.textContent = cat.replace('CATEGORY_', '');
        document.querySelectorAll('.ns-item.active').forEach(item => item.classList.remove('active'));
        const nsItem = document.querySelector(`.ns-item[data-cat="${cat}"]`);
        if (nsItem) nsItem.classList.add('active');
        renderItemsForCategory(cat);
    }

    function renderItemsForCategory(cat) {
        const items = itemsByCategory[cat];
        const filterValue = filterInput.value.toLowerCase();
        const filteredItems = items.filter(item => !filterValue || item.key.toLowerCase().includes(filterValue));

        if (filteredItems.length === 0) {
            updatePanelContent(() => '<div style="color:var(--muted)">No items found.</div>');
            return;
        }

        updatePanelContent(() => {
            const panelHtml = filteredItems.map((item, index) => {
                const price = item.price !== undefined ? `$${item.price.toLocaleString()}` : 'N/A';
                return `<div class="native-row enter" onclick="selectItem('${escapeForJs(item.key)}')">
                    <div class="native-left">
                        <div class="native-name">${escapeHtml(item.key)}</div> 
                        <div class="native-hash">${price} • <span style="color:var(--muted)">${escapeHtml(cat.replace('CATEGORY_', ''))}</span></div>
                    </div>
                </div>`;
            }).join('');
            return `<div class="native-list">${panelHtml}</div>`;
        });
    }

    function renderAllItems() {
        breadcrumb.textContent = 'All Items';
        const q = filterInput.value.toLowerCase();

        const resultsByCat = {};
        for (const cat of Object.keys(itemsByCategory).sort()) {
            const filteredItems = itemsByCategory[cat].filter(item => !q || item.key.toLowerCase().includes(q));
            if (filteredItems.length > 0) {
                resultsByCat[cat] = filteredItems;
            }
        }

        if (Object.keys(resultsByCat).length === 0) {
            updatePanelContent(() => `<div style="color:var(--muted)">No items found for "${escapeHtml(q)}".</div>`);
            return;
        }

        updatePanelContent(() => {
            let panelHtml = '';
            for (const cat in resultsByCat) {
                panelHtml += `<div class="search-namespace-separator"><h3>${escapeHtml(cat.replace('CATEGORY_', ''))}</h3></div>`;
                panelHtml += resultsByCat[cat].map((item, index) => {
                    const price = item.price !== undefined ? `$${item.price.toLocaleString()}` : 'N/A';
                    return `<div class="native-row enter" onclick="selectItem('${escapeForJs(item.key)}')">
                        <div class="native-left">
                            <div class="native-name">${escapeHtml(item.key)}</div>
                            <div class="native-hash">${price} • <span style="color:var(--muted)">${escapeHtml(cat.replace('CATEGORY_', ''))}</span></div>
                        </div>
                    </div>`;
                }).join('');
            }
            return `<div class="native-list">${panelHtml}</div>`;
        });
    }

    window.selectItem = function (key) {
        const item = itemsByKey[key];
        if (!item) return;

        const category = (item.category && item.category[0]) || 'CATEGORY_UNKNOWN';
        currentCategory = category;
        breadcrumb.textContent = `${category.replace('CATEGORY_', '')} > ${item.key}`;
        renderItemDetails(item);
    }

    function renderItemDetails(item) {
        let detailsHtml = '';
        Object.entries(item).forEach(([key, value]) => {
            let valueDisplay;
            if (key === 'key') {
                valueDisplay = `<span class="native-hash" style="cursor: pointer;" onclick="copyToClipboard(event, '${escapeForJs(value)}', 'Key')">${escapeHtml(value)}</span>`;
            } else if (key === 'category' && Array.isArray(value)) {
                const categoryString = value.join(', ');
                valueDisplay = `<span class="native-hash" style="cursor: pointer;" onclick="copyToClipboard(event, '${escapeForJs(categoryString)}', 'Category')">${escapeHtml(categoryString)}</span>`;
            } else {
                valueDisplay = `<span class="native-hash">${escapeHtml(JSON.stringify(value))}</span>`;
            }
            detailsHtml += `<div><strong>${escapeHtml(key)}:</strong> ${valueDisplay}</div>`;
        });

        const html = `
        <div class="native-detail-card">
            <div class="native-detail-header">
                <h2 class="native-detail-name">${escapeHtml(item.key)}</h2>
            </div>
            <div class="native-detail-body">
                <h3>Properties</h3>
                <div class="native-detail-grid">${detailsHtml}</div>
            </div>
        </div>`;
        updatePanelContent(() => html);
    }

    function showNotification(message, type = 'info', duration = 3000) {
        const container = document.getElementById('notification-container');
        if (!container) return;

        const notif = document.createElement('div');
        notif.className = `notification ${type}`;
        notif.textContent = message;
        container.appendChild(notif);

        setTimeout(() => notif.classList.add('show'), 10);

        setTimeout(() => {
            notif.classList.remove('show');
            notif.addEventListener('transitionend', () => notif.remove());
        }, duration);
    }

    window.copyToClipboard = function (evt, text, type) {
        evt.stopPropagation();
        if (!navigator.clipboard) {
            return;
        }
        navigator.clipboard.writeText(text).then(() => showNotification(`Copied ${type}: ${text}`, 'success'), () => showNotification(`Could not copy ${type}`, 'error'));
    }

    function closeModal() {
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
    }

    // --- Event Listeners ---

    globalSearch.addEventListener('input', () => {
        const q = globalSearch.value.toLowerCase();
        const allCategories = Object.keys(itemsByCategory).sort();

        const matches = allCategories.filter(cat =>
            cat.toLowerCase().includes(q) ||
            (itemsByCategory[cat] || []).some(item => (item.key || '').toLowerCase().includes(q))
        );

        const catListHtml = matches.map(cat => {
            const count = itemsByCategory[cat].length;
            return `<div class="ns-item" role="button" data-cat="${cat}">
                <div>
                    <div class="ns-name">${escapeHtml(cat.replace('CATEGORY_', ''))}</div>
                    <div class="ns-count">${count} items</div>
                </div>
                <div style="font-size:12px;color:var(--muted)">></div>
            </div>`;
        }).join('');
        categoriesEl.innerHTML = catListHtml || '<div style="color:var(--muted); padding: 0 16px;">No matches found.</div>';

        document.querySelectorAll('.ns-item').forEach(el => {
            el.addEventListener('click', () => selectCategory(el.dataset.cat));
        });
    });

    filterInput.addEventListener('input', () => {
        if (document.getElementById('showAllCheckbox')?.checked) {
            renderAllItems();
        } else if (currentCategory) {
            renderItemsForCategory(currentCategory);
        }
    });

    const showAllCheckbox = document.getElementById('showAllCheckbox');
    if (showAllCheckbox) {
        showAllCheckbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                renderAllItems();
            } else {
                renderCategories();
            }
        });
    }

    function applyTheme(theme) {
        if (theme === 'light') {
            document.body.classList.add('light-theme');
            if (themeSwitch) themeSwitch.checked = true;
        } else {
            document.body.classList.remove('light-theme');
            if (themeSwitch) themeSwitch.checked = false;
        }
    }

    if (themeSwitch) themeSwitch.addEventListener('change', (e) => {
        const newTheme = e.target.checked ? 'light' : 'dark';
        localStorage.setItem('theme', newTheme);
        applyTheme(newTheme);
    });

    if (modalClose) modalClose.addEventListener('click', () => closeModal());
    if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    applyTheme(localStorage.getItem('theme') || 'dark');
    loadCatalog();
});