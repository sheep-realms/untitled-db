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

        if (!state.childrenMap.has(tag.parent)) {
            state.childrenMap.set(tag.parent, []);
        }

        state.childrenMap.get(tag.parent).push(tag);
    }

    for (const list of state.childrenMap.values()) {

        list.sort((a, b) => {
            return a.name.localeCompare(
                b.name,
                "zh-CN"
            );
        });
    }
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

function getParentTags(tagName) {

    const result = [];

    let current = state.tagMap.get(tagName);

    while (current?.parent) {

        result.push(current.parent);

        current = state.tagMap.get(current.parent);
    }

    return result;
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
        return a.title.localeCompare(
            b.title,
            "zh-CN"
        );
    });

    return result;
}

function renderTagGroup(
    tags,
    parentName = null
) {

    if (
        parentName &&
        !state.selectedTags.has(
            parentName
        )
    ) {
        return;
    }

    const group =
        document.createElement("div");

    group.className =
        "tag-group";

    const buttons =
        document.createElement("div");

    buttons.className =
        "tag-buttons";

    for (const tag of tags) {

        const selected =
            state.selectedTags.has(
                tag.name
            );

        const btn =
            document.createElement(
                "button"
            );

        btn.className =
            "tag-btn";

        btn.textContent =
            tag.name;

        if (selected) {
            btn.classList.add(
                "active"
            );
        }

        if (
            selected &&
            hasSelectedChild(
                tag.name
            )
        ) {
            btn.classList.add(
                "covered"
            );
        }

        btn.addEventListener(
            "click",
            () => {

                if (selected) {

                    state.selectedTags.delete(
                        tag.name
                    );

                    const descendants =
                        getAllDescendants(
                            tag.name
                        );

                    for (
                        const descendant
                        of descendants
                    ) {
                        state.selectedTags.delete(
                            descendant
                        );
                    }

                } else {

                    state.selectedTags.add(
                        tag.name
                    );
                }

                renderTagSelector();
                updateFilterFromUI();
            }
        );

        buttons.appendChild(btn);
    }

    group.appendChild(buttons);

    dom.tagGroups.appendChild(group);

    for (const tag of tags) {

        const children =
            state.childrenMap.get(
                tag.name
            );

        if (
            children &&
            state.selectedTags.has(
                tag.name
            )
        ) {
            renderTagGroup(
                children,
                tag.name
            );
        }
    }
}

function renderTagSelector() {

    dom.tagGroups.innerHTML = "";

    renderTagGroup(
        getRootTags()
    );
}

function buildFilterText() {
    const parts = [];

    const keyword =
        dom.keywordInput.value.trim();

    if (keyword) {
        parts.push(keyword);
    }

    for (
        const tag
        of getEffectiveTags()
    ) {
        parts.push(
            `tag:"${tag}"`
        );
    }

    return parts.join(" ");
}

function updateFilterFromUI() {

    const query =
        buildFilterText();

    dom.queryInput.value =
        query;
    
    runFilter(query);
}

function runFilter(query) {
    const result =
        state.filter.filter(
            query
        );

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

    state.customMode =
        !state.customMode;

    dom.normalSearch.classList.toggle(
        "hidden",
        state.customMode
    );

    dom.advancedSearch.classList.toggle(
        "hidden",
        !state.customMode
    );

    dom.toggleMode.textContent =
        state.customMode
            ? "Back"
            : "Custom Search Statement";
}

async function init() {

    state.tags =
        await loadJson(
            `res/data/tag/${DB_NAME}.json`
        );

    buildTagMap(
        state.tags
    );

    buildTagRelations();

    state.data =
        await loadAllData(
            state.tags
        );

    state.filter =
        new DataFilter(
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
                        value: "title"
                    }
                }
            ],
            state.data
        );

    renderTagSelector();

    updateFilterFromUI();

    dom.keywordInput.addEventListener(
        "input",
        () => {
            debounce(() => {
                updateFilterFromUI();
            });
        }
    );

    dom.queryInput.addEventListener(
        "input",
        () => {
            debounce(() => {
                runFilter(
                    dom.queryInput.value
                );

            });
        }
    );

    dom.toggleMode.addEventListener(
        "click",
        switchMode
    );
}

init();