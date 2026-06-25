"use strict";

const DB_NAME = EchoLiveTools.getUrlParam('name');

if (DB_NAME === null) {
    throw Error('Missing DB_NAME');
}

document.querySelector("#h1-value").textContent = DB_NAME;

const state = {
    tags: [],
    tagMap: new Map(),
    childrenMap: new Map(),
    depthMap: new Map(),

    data: [],

    filter: null,

    selectedTags: new Set(),

    customMode: false
};


const dom = {
    keywordInput: document.querySelector("#keyword-input"),
    queryInput: document.querySelector("#query-input"),

    tagGroups: document.querySelector("#tag-groups"),

    resultList: document.querySelector("#result-list"),
    resultCount: document.querySelector("#result-count"),

    normalSearch: document.querySelector("#normal-search"),
    advancedSearch: document.querySelector("#advanced-search"),

    toggleMode: document.querySelector("#toggle-mode")
};

let debounceTimer = null;

function debounce(fn, delay = 700) {

    clearTimeout(debounceTimer);

    debounceTimer = setTimeout(() => {
        fn();
    }, delay);
}

async function loadJson(path) {

    const response = await fetch(path);

    if (!response.ok) {
        throw new Error(`Failed to load ${path}`);
    }

    return response.json();
}

function buildTagMap(tags) {

    state.tagMap.clear();

    for (const tag of tags) {
        state.tagMap.set(tag.name, tag);
    }
}

function buildTagRelations() {

    state.childrenMap.clear();

    for (const tag of state.tags) {

        if (!tag.parent) {
            continue;
        }

        const parents =
            Array.isArray(tag.parent)
                ? tag.parent
                : [tag.parent];

        for (const parent of parents) {

            if (
                !state.childrenMap.has(
                    parent
                )
            ) {
                state.childrenMap.set(
                    parent,
                    []
                );
            }

            state.childrenMap
                .get(parent)
                .push(tag);
        }
    }

    for (
        const list
        of state.childrenMap.values()
    ) {

        list.sort((a, b) =>
            a.name.localeCompare(
                b.name,
                "zh-CN"
            )
        );
    }
}

function buildDepthMap() {
    state.depthMap.clear();

    const queue = [];

    for (const tag of state.tags) {

        if (!tag.parent) {

            state.depthMap.set(
                tag.name,
                0
            );

            queue.push(tag);
        }
    }

    while (queue.length) {

        const current =
            queue.shift();

        const currentDepth =
            state.depthMap.get(
                current.name
            );

        const children =
            state.childrenMap.get(
                current.name
            ) ?? [];

        for (const child of children) {

            const nextDepth =
                currentDepth + 1;

            const oldDepth =
                state.depthMap.get(
                    child.name
                );

            if (
                oldDepth == null ||
                nextDepth > oldDepth
            ) {

                state.depthMap.set(
                    child.name,
                    nextDepth
                );

                queue.push(child);
            }
        }
    }
}

function buildVisibleGroups() {
    const groups =
        new Map();

    const visibleTags =
        getVisibleTags();

    for (
        const tag
        of visibleTags
    ) {

        const depth =
            state.depthMap.get(
                tag.name
            ) ?? 0;

        if (
            !groups.has(depth)
        ) {

            groups.set(
                depth,
                []
            );
        }

        groups
            .get(depth)
            .push(tag);
    }

    for (
        const tags
        of groups.values()
    ) {

        tags.sort((a, b) =>
            a.name.localeCompare(
                b.name,
                "zh-CN"
            )
        );
    }

    return groups;
}

function getRootTags() {

    return state.tags
        .filter(tag => !tag.parent)
        .sort((a, b) => {
            return a.name.localeCompare(
                b.name,
                "zh-CN"
            );
        });
}

function getParentTags(
    tagName,
    result = new Set()
) {

    const current =
        state.tagMap.get(tagName);

    if (
        !current ||
        !current.parent
    ) {
        return [...result];
    }

    const parents =
        Array.isArray(current.parent)
            ? current.parent
            : [current.parent];

    for (const parent of parents) {

        if (
            result.has(parent)
        ) {
            continue;
        }

        result.add(parent);

        getParentTags(
            parent,
            result
        );
    }

    return [...result];
}

function getAllDescendants(tagName) {

    const result = [];

    const children =
        state.childrenMap.get(tagName);

    if (!children) {
        return result;
    }

    for (const child of children) {

        result.push(child.name);

        result.push(
            ...getAllDescendants(
                child.name
            )
        );
    }

    return result;
}

function hasSelectedChild(tagName) {

    const children =
        state.childrenMap.get(tagName);

    if (!children) {
        return false;
    }

    for (const child of children) {

        if (
            state.selectedTags.has(
                child.name
            )
        ) {
            return true;
        }

        if (
            hasSelectedChild(
                child.name
            )
        ) {
            return true;
        }
    }

    return false;
}

function getEffectiveTags() {

    const result = [];

    for (const tagName of state.selectedTags) {

        if (
            hasSelectedChild(tagName)
        ) {
            continue;
        }

        result.push(tagName);
    }

    return result.sort((a, b) =>
        a.localeCompare(
            b,
            "zh-CN"
        )
    );
}

function getVisibleTags() {
    const result = [];

    for (const tag of state.tags) {

        if (!tag.parent) {

            result.push(tag);

            continue;
        }

        const parents =
            Array.isArray(tag.parent)
                ? tag.parent
                : [tag.parent];

        const visible =
            parents.some(parent =>
                state.selectedTags.has(
                    parent
                )
            );

        if (visible) {
            result.push(tag);
        }
    }

    return result;
}

function getChildTags(tagName) {
    return state.tags.filter(e => e.parent === tagName || e.parent?.includes(tagName));
}

async function loadAllData(tags) {

    const result = [];

    for (const tag of tags) {

        if (!tag.src) {
            continue;
        }

        const items = await loadJson(
            `res/data/payload/${tag.src}`
        );

        for (const item of items) {

            const mergedTags =
                new Set(
                    item.tags ?? []
                );

            mergedTags.add(
                tag.name
            );

            for (
                const parentTag
                of getParentTags(tag.name)
            ) {
                mergedTags.add(parentTag);
            }

            result.push({
                ...item,
                tags: [...mergedTags]
            });
        }
    }

    result.sort((a, b) => {
        return (a.sort_name ?? a.title).localeCompare(
            b.sort_name ?? b.title,
            "zh-CN"
        );
    });

    return result;
}

function buildFilterText() {
    const parts = [];

    const keyword =
        dom.keywordInput.value.trim();

    if (keyword) {
        parts.push(keyword);
    }

    for (const tag of getEffectiveTags()) {
        parts.push(
            `tag:${tag}`
        );
    }

    return parts.join(" ");
}

function updateFilterFromUI() {
    const query =buildFilterText();
    dom.queryInput.value = query;
    runFilter(query);
}

function runFilter(query) {
    const result = state.filter.filter(query);
    renderResult(result);
}

function renderResult(result) {
    dom.resultCount.textContent =
        result.length;

    dom.resultList.innerHTML =
        "";

    for (const item of result) {

        const div =
            document.createElement(
                "div"
            );

        div.className =
            "result-item";

        div.innerHTML = `
            <div class="result-title">
                ${item.title}
            </div>
            <div class="result-meta">
                ${ item?.author ? item?.author : '' }
            </div>
            <div class="result-tags">
                ${item.tags.join(", ")}
            </div>
        `;

        dom.resultList.appendChild(
            div
        );
    }
}

function switchMode() {
    state.customMode = !state.customMode;
    dom.normalSearch.classList.toggle("hidden", state.customMode);
    dom.advancedSearch.classList.toggle("hidden", !state.customMode);
    dom.toggleMode.className = state.customMode ? "soild" : "";
}

function hasVisibleParent(tagName) {
    const tag = state.tagMap.get(tagName);
    if (!tag || !tag.parent) return false;

    const parents = Array.isArray(tag.parent) ? tag.parent : [tag.parent];

    return parents.some(parent => state.selectedTags.has(parent));
}

function removeInvisibleDescendants(tagName) {
    const children = state.childrenMap.get(tagName);
    if (!children) return;

    for (const child of children) {
        if (!hasVisibleParent(child.name)) {
            state.selectedTags.delete(child.name);
            removeInvisibleDescendants(child.name);
        }
    }
}

function renderTagSelector() {
    dom.tagGroups.innerHTML = "";

    const groups = buildVisibleGroups();
    const depths = [...groups.keys()].sort((a, b) => a - b);

    for (const depth of depths) {
        const group = document.createElement("div");
        group.className = "tag-group";

        const buttons = document.createElement("div");
        buttons.className = "tag-buttons";
        
        function _renderSubTagSelector(tags) {
            for (const tag of tags) {
                const selected = state.selectedTags.has(tag.name);
                const btn = document.createElement("button");
                btn.className = "tag-btn";
                btn.textContent = tag.name;

                if (selected) {
                    btn.classList.add("active");
                }

                if (selected && hasSelectedChild(tag.name)) {
                    btn.classList.add("covered");
                }

                btn.addEventListener("click", () => {
                        if (selected) {
                            state.selectedTags.delete(tag.name);
                            removeInvisibleDescendants(tag.name);
                        } else {
                            state.selectedTags.add(tag.name);
                        }

                        renderTagSelector();
                        updateFilterFromUI();
                    }
                );

                buttons.appendChild(btn);
            }
        }

        const tags = groups.get(depth);

        // let hasChildTags = [];
        // let noChildTags = [];

        // for (const tag of tags) {
        //     if (getChildTags(tag.name).length > 0) {
        //         hasChildTags.push(tag);
        //     } else {
        //         noChildTags.push(tag);
        //     }
        // }

        let notAdditionalTags = [];
        let additionalTags = [];

        for (const tag of tags) {
            if (tag.additional) {
                additionalTags.push(tag);
            } else {
                notAdditionalTags.push(tag);
            }
        }

        _renderSubTagSelector(notAdditionalTags);

        if (notAdditionalTags.length > 0 && additionalTags.length > 0) {
            const split = document.createElement("span");
            split.className = "tag-split";
            buttons.appendChild(split);
        }

        _renderSubTagSelector(additionalTags);

        group.appendChild(buttons);
        dom.tagGroups.appendChild(group);
    }
}

async function init() {
    state.tags = await loadJson(`res/data/tag/${DB_NAME}.json`);

    buildTagMap(state.tags);

    buildTagRelations();
    buildDepthMap();

    state.data = await loadAllData(state.tags);

    state.filter = new DataFilter(
        "",
        [
            {
                name: "tag",
                type: "array_string",
                map: {
                    value: "tags",
                    search: "tag"
                }
            },
            {
                name: "main",
                type: "string",
                map: {
                    value: ["title", "author"]
                }
            }
        ],
        state.data
    );

    renderTagSelector();
    updateFilterFromUI();

    dom.keywordInput.addEventListener("input", () => {
        debounce(() => {
            updateFilterFromUI();
        });
    });

    dom.queryInput.addEventListener("input", () => {
        debounce(() => {
            runFilter(dom.queryInput.value);
        });
    });

    dom.toggleMode.addEventListener("click", switchMode);
}

init();