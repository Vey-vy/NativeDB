document.addEventListener('DOMContentLoaded', () => {


    const isRDR2 = window.location.pathname.includes('/rdr2_native/');
    const isRDR = window.location.pathname.includes('/rdr_native/');

    const RDR_H_URL = 'https://raw.githubusercontent.com/K3rhos/RDR-PC-Natives-DB/main/Natives.h';

    const RAW_URL = isRDR
        ? RDR_H_URL
        : (isRDR2
            ? 'https://raw.githubusercontent.com/alloc8or/rdr3-nativedb-data/master/natives.json'
            : 'https://raw.githubusercontent.com/alloc8or/gta5-nativedb-data/master/natives.json');

    const namespacesEl = document.getElementById('namespaces');
    const panelContent = document.getElementById('panelContent');
    const breadcrumb = document.getElementById('breadcrumb');
    const filterInput = document.getElementById('filterInput');
    const globalSearch = document.getElementById('globalSearch');
    const refreshBtn = document.getElementById('refreshBtn');
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modalTitle');
    const modalHash = document.getElementById('modalHash');
    const modalBody = document.getElementById('modalBody');
    const modalClose = document.getElementById('modalClose');

    const themeSwitch = document.getElementById('themeSwitch');
    const redhookToggle = document.getElementById('redhookToggle');

    let nativesMap = {};
    let currentNS = null;

    function escapeHtml(s) { return String(s || '').replace(/[&<>()"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '(': '&#40;', ')': '&#41;', '"': '&quot;', "'": '&#39;' }[c])); }
    function norm(n) {
        const normalized = {
            name: n.name || n.NativeName || n.hashName || n[0] || '',
            hash: n.hash || n.Hash || n.native || n[1] || '',
            jhash: n.jhash || '',
            comment: n.comment || n.desc || n.description || '',
            params: n.params || n.Params || n.arguments || n.args || '',
            returns: n.returns || n.return || n.return_type || ''
        };
        return normalized;
    }

    function buildMap(json) {
        const map = {};
        if (typeof json === 'object' && json !== null) {
            for (const ns in json) {
                if (Object.prototype.hasOwnProperty.call(json, ns)) {
                    const natives = json[ns];
                    if (typeof natives === 'object' && natives !== null) {
                        map[ns] = [];
                        for (const hash in natives) {
                            if (Object.prototype.hasOwnProperty.call(natives, hash)) {
                                const native = natives[hash];
                                map[ns].push(norm({ ...native, hash }));
                            }
                        }
                    }
                }
            }
        }
        return map;
    }

    function buildMapFromH(text) {
        const map = { RDR2: [] };
        let currentNamespace = "UNK";
        const lines = text.split('\n');

        const nativeRegex = /^\s*static\s+(?<returns>[\w*&<>:\s]+)\s+(?<name>\w+)\s*\((?<params>.*?)\)/;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            const nsMatch = line.match(/^namespace\s+(\w+)/);
            if (nsMatch) {
                currentNamespace = nsMatch[1];
                if (!map[currentNamespace]) {
                    map[currentNamespace] = [];
                }
                continue;
            }

            if (line === '}') {
                currentNamespace = "UNK";
                continue;
            }

            const match = line.match(nativeRegex);

            if (match) {
                const { name, returns, params } = match.groups;
                let hash = "0x0000000000000000";
                let realName = name;

                if (i + 2 < lines.length) {
                    const bodyLine1 = lines[i + 1].trim();
                    const bodyLine2 = lines[i + 2].trim();
                    const invokeLine = bodyLine1.includes("Invoke<") ? bodyLine1 : (bodyLine2.includes("Invoke<") ? bodyLine2 : "");
                    if (invokeLine) {
                        const invokeHashMatch = invokeLine.match(/Invoke\s*<\s*(0x[A-F0-9]{1,16})/i);
                        if (invokeHashMatch) {
                            hash = invokeHashMatch[1];
                        }
                    }
                }
                if (name.startsWith("_0x")) {
                    realName = hash;
                }

                if (!map[currentNamespace]) {
                    map[currentNamespace] = [];
                }

                const paramsArray = params.trim() ? params.split(',').map(p => {
                    const parts = p.trim().split(' ');
                    const paramName = parts.pop();
                    const paramType = parts.join(' ');
                    return { type: paramType, name: paramName };
                }) : [];

                map[currentNamespace].push(norm({ name: realName, hash, params: paramsArray, returns: returns.trim() }));
            }
        }
        delete map["RDR2"];
        return map;
    }

    async function load() {
        namespacesEl.innerHTML = 'Downloading...';
        try {
            const res = await fetch(RAW_URL, { cache: 'no-store' });
            if (!res.ok) throw new Error('HTTP ' + res.status);

            if (isRDR) {
                const text = await res.text();
                nativesMap = buildMapFromH(text);
            } else {
                const json = await res.json();
                nativesMap = buildMap(json);
            }

            const showAllCheckbox = document.getElementById('showAllCheckbox');
            if (showAllCheckbox?.checked) {
                renderAllNatives();
                renderSidebarNamespaces();
            } else {
                renderNamespaces();
            }
        } catch (e) {
            namespacesEl.innerHTML = `<div style="color:orange">Error: ${escapeHtml(e.message)}</div>`;
            panelContent.innerHTML = `<div style="color:var(--muted)">Could not load natives file — check your connection or open the raw file directly.</div>`;
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

    function renderNamespaces() {
        breadcrumb.textContent = 'Namespaces';
        currentNS = null;

        const showRedhook = !redhookToggle || redhookToggle.checked;
        const visibleNamespaces = Object.keys(nativesMap).sort().filter(ns => showRedhook || ns !== 'REDHOOK');

        updatePanelContent(() => '<div class="ns-grid">' + visibleNamespaces.map(ns => {
            const count = nativesMap[ns].length;
            return `<div class="ns-card" data-ns="${ns}" onclick="toggleNamespace('${ns}')"><h3>${escapeHtml(ns)}</h3><p>${count} natives</p></div>`;
        }).join('') + '</div>');

        renderSidebarNamespaces(visibleNamespaces);
    }

    function renderSidebarNamespaces(namespaces = null) {
        const nsListHtml = (namespaces || Object.keys(nativesMap).sort()).map(ns => {
            const count = nativesMap[ns].length;
            return `<div>
            <div class="ns-item" role="button" data-ns="${ns}">
                <div>
                    <div class="ns-name">${escapeHtml(ns)}</div>
                    <div class="ns-count">${count} natives</div>
                </div>
                <div style="font-size:12px;color:var(--muted)">></div>
            </div>
            <div class="natives-in-sidebar" id="natives-for-${ns}"></div>
        </div>`;
        }).join('');
        namespacesEl.innerHTML = nsListHtml;

        document.querySelectorAll('.ns-item').forEach(el => {
            el.addEventListener('click', () => toggleNamespace(el.dataset.ns));
        });
    }

    window.toggleNamespace = function (ns) {
        const container = document.getElementById(`natives-for-${ns}`);
        const nsItem = document.querySelector(`.ns-item[data-ns="${ns}"]`);

        document.querySelectorAll('.ns-item.active').forEach(item => {
            if (item !== nsItem) {
                item.classList.remove('active');
                document.getElementById(`natives-for-${item.dataset.ns}`).style.maxHeight = '0';
            }
        });

        const isActive = nsItem.classList.toggle('active');

        if (isActive) {
            currentNS = ns;
            const q = filterInput.value.toLowerCase();
            const nativesHtml = nativesMap[ns]
                .filter(n => !q || n.name.toLowerCase().includes(q) || (n.comment || '').toLowerCase().includes(q))
                .map(n =>
                    `<div class="native-in-sidebar" onclick="selectNative('${ns}', '${escapeForJs(n.hash)}')">${escapeHtml(n.name)}</div>`
                ).join('');
            container.innerHTML = nativesHtml;
            container.style.opacity = '1';
            container.style.transform = 'translateY(0)';
            container.style.maxHeight = container.scrollHeight + "px";
            renderNativesForNamespace(ns);
        } else {
            currentNS = null;
            container.style.maxHeight = '0';
            renderNamespaces();
        }
    }

    function refreshViews() {
        const showAllCheckbox = document.getElementById('showAllCheckbox');
        (showAllCheckbox?.checked) ? renderAllNatives() : globalSearch.dispatchEvent(new Event('input'));
    }

    function renderNativesForNamespace(ns) {
        breadcrumb.textContent = ns;
        const natives = nativesMap[ns];
        const filterValue = document.getElementById('filterInput').value.toLowerCase();
        const filteredNatives = natives.filter(n => !filterValue || n.name.toLowerCase().includes(filterValue) || (n.comment || '').toLowerCase().includes(filterValue));

        if (filteredNatives.length === 0) {
            updatePanelContent(() => '<div style="color:var(--muted)">No natives found.</div>');
            return;
        }

        updatePanelContent(() => {
            const panelHtml = filteredNatives.map(n => {
                return `<div class="native-row enter" onclick="selectNative('${ns}', '${escapeForJs(n.hash)}')">
                    <div class="native-left">
                        <div class="native-name">${escapeHtml(n.name)}</div> 
                        <div class="native-hash">${escapeHtml(n.hash)} • <span style="color:var(--muted)">${escapeHtml(ns)}</span></div>
                    </div>
                </div>`;
            }).join('');
            return `<div class="native-list">${panelHtml}</div>`;
        });
    }

    window.selectNative = function (ns, hash) {
        const native = nativesMap[ns].find(n => n.hash === hash);
        if (!native) return;

        currentNS = ns;
        breadcrumb.textContent = `${ns} > ${native.name}`;
        renderNativeDetails(native);
    }

    function renderNativeDetails(n) {
        const paramsDisplay = n.params && Array.isArray(n.params) ? n.params.map(p => `${p.type} ${p.name}`).join(', ') : '';

        const html = `
<div class="native-detail-card">
    <div class="native-detail-header">
        <h2 class="native-detail-name">${escapeHtml(n.name)}</h2>
    </div>
    <div class="native-detail-body">
        <h3>Signature</h3>
        <pre class="code"><code>${escapeHtml(n.returns)} ${escapeHtml(n.name)}(${escapeHtml(paramsDisplay)})</code></pre>
        
        <h3>Details</h3>
        <div class="native-detail-grid">
            <div><strong>Hash:</strong> <span class="native-hash" style="cursor: pointer;" onclick="copyToClipboard(event, '${escapeForJs(n.hash)}', 'Hash')">${escapeHtml(n.hash)}</span></div>
            ${n.jhash ? `<div><strong>JHash:</strong> <span class="native-hash" style="cursor: pointer;" onclick="copyToClipboard(event, '${escapeForJs(n.jhash)}', 'JHash')">${escapeHtml(n.jhash)}</span></div>` : ''}
        </div>

        ${n.comment ? `<div><h3>Comment</h3><p class="native-detail-comment">${escapeHtml(n.comment)}</p></div>` : ''}
    </div>
    <div class="native-detail-footer">
        <button class="btn" onclick="openDetail(event,'${escapeForJs(n.name)}','${escapeForJs(n.hash)}','${escapeForJs(n.comment)}','${escapeForJs(paramsDisplay)}','${escapeForJs(n.returns)}')">Details</button>
        <button class="ghost" onclick="copySig(event,'${escapeForJs(n.name)}','${escapeForJs(paramsDisplay)}')">Copy Signature</button>
    </div>
</div>`;
        updatePanelContent(() => html);
    }

    function escapeForJs(s) {
        return (s || '').replace(/\\/g, '\\\\').replace(/'/g, "\' ").replace(/"/g, '\"').replace(/\n/g, '\\n');
    }

    window.openDetail = function (evt, name, hash, comment, params, returns) {
        evt.stopPropagation();
        modalTitle.textContent = name;
        modalHash.textContent = hash;
        modalBody.innerHTML = `<div style='display:flex;gap:14px;flex-direction:column'><div style='color:var(--muted)'>${escapeHtml(comment)}</div>${params ? `<pre class='code'>Params: ${escapeHtml(params)}</pre>` : ''}${returns ? `<pre class='code'>Return: ${escapeHtml(returns)}</pre>` : ''}<div style='display:flex;gap:8px'><button class='btn' onclick="copySig(event,'${escapeForJs(name)}','${escapeForJs(params)}')">Copy signature</button><button class='ghost' onclick='closeModal()'>Close</button></div></div>`;
        modal.classList.add('open');
        modal.setAttribute('aria-hidden', 'false');
    }

    window.closeModal = function () { modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); }

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
        navigator.clipboard?.writeText(text)
            .then(() => showNotification(`Copied ${type}: ${text}`, 'success'))
            .catch(() => showNotification(`Could not copy ${type}`, 'error'));
    }

    window.copySig = function (evt, name, params) { evt.stopPropagation(); const sig = name + (params ? `(${params})` : ''); navigator.clipboard?.writeText(sig).then(() => showNotification('Copied: ' + sig, 'success')).catch(() => showNotification('Could not copy', 'error')) }

    filterInput.addEventListener('input', () => {
        const showAllCheckbox = document.getElementById('showAllCheckbox');
        if (showAllCheckbox?.checked) {
            renderAllNatives();
        } else if (currentNS) {
            renderNativesForNamespace(currentNS);
        }
    });

    globalSearch.addEventListener('input', () => {
        const q = globalSearch.value.toLowerCase();
        const showRedhook = !redhookToggle || redhookToggle.checked;

        const matches = Object.keys(nativesMap)
            .filter(ns => (showRedhook || ns !== 'REDHOOK')) // Filter REDHOOK namespace if toggle is off
            .filter(ns => !q || // if query is empty, show all (respecting redhook toggle)
                ns.toLowerCase().includes(q) ||
                (nativesMap[ns] || []).some(n => (n.name || '').toLowerCase().includes(q) || (n.hash || '').toLowerCase().includes(q) || (n.comment || '').toLowerCase().includes(q))
            );

        const nsListHtml = matches.map(ns => {
            const count = nativesMap[ns] ? nativesMap[ns].length : 0;
            return `<div>
            <div class="ns-item" role="button" data-ns="${ns}">
                <div>
                    <div class="ns-name">${escapeHtml(ns)}</div>
                    <div class="ns-count">${count} natives</div>
                </div>
                <div style="font-size:12px;color:var(--muted)">></div>
            </div>
            <div class="natives-in-sidebar" id="natives-for-${ns}"></div>
        </div>`;
        }).join('');
        namespacesEl.innerHTML = nsListHtml;

        document.querySelectorAll('.ns-item').forEach(el => {
            el.addEventListener('click', () => toggleNamespace(el.dataset.ns));
        });
    });

    refreshBtn.addEventListener('click', load);

    function renderAllNatives() {
        breadcrumb.textContent = 'All natives';
        const q = filterInput.value.toLowerCase();
        const showRedhook = !redhookToggle || redhookToggle.checked;

        const resultsByNs = {};
        const namespacesToSearch = Object.keys(nativesMap).sort().filter(ns => showRedhook || ns !== 'REDHOOK');

        for (const ns of namespacesToSearch) {
            const filteredNatives = nativesMap[ns].filter(n =>
                !q ||
                n.name.toLowerCase().includes(q) ||
                (n.comment || '').toLowerCase().includes(q)
            );
            if (filteredNatives.length > 0) {
                resultsByNs[ns] = filteredNatives;
            }
        }

        if (Object.keys(resultsByNs).length === 0) {
            updatePanelContent(() => `<div style="color:var(--muted)">No natives found for "${escapeHtml(q)}".</div>`);
            return;
        }

        updatePanelContent(() => {
            let panelHtml = '';
            for (const ns in resultsByNs) {
                panelHtml += `<div class="search-namespace-separator"><h3>${escapeHtml(ns)}</h3></div>`;
                panelHtml += resultsByNs[ns].map(n => `<div class="native-row enter" onclick="selectNative('${ns}', '${escapeForJs(n.hash)}')">
                    <div class="native-left">
                        <div class="native-name">${escapeHtml(n.name)}</div>
                        <div class="native-hash">${escapeHtml(n.hash)} • <span style="color:var(--muted)">${escapeHtml(ns)}</span></div>
                    </div>
                </div>`).join('');
            }
            return `<div class="native-list">${panelHtml}</div>`;
        });
    }

    const showAllCheckbox = document.getElementById('showAllCheckbox');
    if (showAllCheckbox) {
        showAllCheckbox.addEventListener('change', (e) => {
            localStorage.setItem('showAll', e.target.checked);
            window.location.reload();
        });
    }

    if (redhookToggle) {
        redhookToggle.addEventListener('change', () => {
            localStorage.setItem('showRedhook', redhookToggle.checked);
            window.location.reload();
        });
    }

    if (modalClose) {
        modalClose.addEventListener('click', () => window.closeModal());
    }
    if (modal) {
        modal.addEventListener('click', (e) => { if (e.target === modal) window.closeModal(); });
    }

    // --- Dynamic Credits Modal ---
    function createCreditsModal() {
        const creditsBtn = document.getElementById('creditsBtn');
        if (!creditsBtn) return;

        const creditSource = isRDR
            ? { name: 'K3rhos', url: 'https://k3rhos.me/' }
            : { name: 'Alloc8or', url: 'https://alloc8or.re/' };

        const modalHTML = `
        <div id="creditsModal" class="modal" aria-hidden="true">
            <div class="modal-card">
                <div class="modal-header">
                    <div style="font-weight:800;color:var(--accent)">Credits</div>
                    <div>
                        <button class="close" id="creditsModalClose" title="Close">✕</button>
                    </div>
                </div>
                <div style="margin-top:14px;color:var(--muted);">
                    <ul style="list-style:none;padding-left:10px;">
                        <li>- Vey</li>
                        <li>- <a href="${creditSource.url}" target="_blank" class="credit-link">${creditSource.name} (for data)</a></li>
                    </ul>
                </div>
            </div>
        </div>`;

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        const creditsModal = document.getElementById('creditsModal');
        const creditsModalClose = document.getElementById('creditsModalClose');

        creditsBtn.addEventListener('click', () => {
            creditsModal.classList.add('open');
            creditsModal.setAttribute('aria-hidden', 'false');
        });

        const closeCreditsModal = () => {
            creditsModal.classList.remove('open');
            creditsModal.setAttribute('aria-hidden', 'true');
        };

        creditsModalClose.addEventListener('click', closeCreditsModal);
        creditsModal.addEventListener('click', (e) => { if (e.target === creditsModal) closeCreditsModal(); });
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

    function applyRedhookToggleState() {
        if (redhookToggle) {
            const showRedhook = localStorage.getItem('showRedhook') !== 'false';
            redhookToggle.checked = showRedhook;
        }
    }

    function applyShowAllState() {
        const showAllCheckbox = document.getElementById('showAllCheckbox');
        if (showAllCheckbox) {
            const showAll = localStorage.getItem('showAll') === 'true';
            showAllCheckbox.checked = showAll;
        }
    }

    if (themeSwitch) themeSwitch.addEventListener('change', (e) => {
        const newTheme = e.target.checked ? 'light' : 'dark';
        localStorage.setItem('theme', newTheme);
        applyTheme(newTheme);
    });

    applyTheme(localStorage.getItem('theme') || 'dark');
    applyRedhookToggleState();
    applyShowAllState();
    createCreditsModal();
    load();
});
