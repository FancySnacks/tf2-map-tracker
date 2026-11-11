const ROOT_ID = "__favorite__";

const cy = cytoscape({
    container: document.getElementById("cy"),
    elements: [],

    // Prevent users from dragging nodes.
    autoungrabify: true,

    wheelSensitivity: 0.3,

    style: [
        {
            selector: "node",
            style: {
                "shape": "ellipse",
                "width": 90,
                "height": 90,
                "background-color": "#3498db",
                "label": "data(label)",
                "color": "#ffffff",
                "font-size": "11px",
                "text-valign": "bottom",
                "text-margin-y": 12,
                "text-max-width": "80px",
                "border-width": 2,
                "border-color": "#ffffff"
            }
        },
        {
            selector: 'node[img]',
            style: {
                "background-image": "data(img)",
                "background-fit": "cover",
                "background-clip": "node",
                "background-repeat": "no-repeat",
                "background-position-x": "50%",
                "background-position-y": "50%",
                "background-image-opacity": 1
            }
        },
        {
            selector: "#" + ROOT_ID,
            style: {
                "background-color": "#ffffff",
                "background-image": "assets/maps/tf_logo.jpg",
                "width": 90,
                "height": 90,
                "color": "#ffffff",
                "font-size": "11px",
                "text-valign": "bottom",
                "text-margin-y": 12,
                "text-max-width": "80px",
                "border-width": 2,
                "border-color": "#ffffff"
            }
        },
        {
            selector: "edge",
            style: {
                "width": 2,
                "line-color": "#888888",
                "curve-style": "straight"
            }
        },
        {
            selector: "node:selected",
            style: {
                "border-width": 5,
                "border-color": "#f1c40f"
            }
        },
        {
            selector: "node.completed",
            style: {
                "border-color": "#22c55e",
                "border-width": 7
            },
    }
    ],

    layout: { name: "preset" }
});

// Shuffle an array using Fisher-Yates.
function shuffle(array) {
    const result = [...array];

    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }

    return result;
}

// Group maps according to their release year.
function groupByYear(maps) {
    const years = new Map();

    for (const map of maps) {
        const year = map.date_added.slice(0, 4);

        if (!years.has(year)) {
            years.set(year, []);
        }

        years.get(year).push(map);
    }

    return [...years.entries()]
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([, group]) => group);
}

// Draw the graph using concentric rings.
function drawGraph(layers) {
    cy.minZoom(0.0001);
    cy.maxZoom(10);

    const elements = [
        {
            data: {
                id: ROOT_ID,
                label: "Your Favourite Map"
            }
        }
    ];

    const positions = {
        [ROOT_ID]: { x: 0, y: 0 }
    };

    let radius = 0;

    layers.forEach((group, depth) => {
        // Expand the radius to avoid overcrowding.
        radius = Math.max(
            radius + 230,
            group.length * 140 / (2 * Math.PI)
        );

        group.forEach((map, index) => {
            const id = map.name;

            elements.push({
                data: {
                    id: id,
                    label: map.name,
                    img: map.img,
                    mode: map.mode,
                    date_added: map.date_added
                }
            });

            // Connect each map to a previous layer.
            let parentId = ROOT_ID;

            if (depth > 0) {
                const previous = layers[depth - 1];
                const parentIndex = Math.floor(
                    index * previous.length / group.length
                );

                parentId = previous[parentIndex].name;
            }

            elements.push({
                data: {
                    source: parentId,
                    target: id
                }
            });

            // Position each node around its ring.
            const angle =
                2 * Math.PI * index / group.length
                - Math.PI / 2;

            positions[id] = {
                x: radius * Math.cos(angle),
                y: radius * Math.sin(angle)
            };
        });
    });

    // Replace the existing graph.
    cy.elements().remove();
    cy.add(elements);

    // Apply precomputed positions.
    cy.layout({
        name: "preset",
        positions: node => positions[node.id()],
        fit: true,
        padding: 40,
        animate: false
    }).run();

    const fittedZoom = cy.zoom();

    cy.minZoom(fittedZoom);
    cy.maxZoom(Math.max(2.5, fittedZoom));

    cy.zoom(1.2);
}

// Load the JSON and initialize controls.
async function main() {
    const response = await fetch("./data/map_list_local.json");

    if (!response.ok) {
        throw new Error("Could not load map_list_local.json");
    }

    const data = await response.json();
    const maps = data.maps;

    const favoriteMap = {
    name: ROOT_ID,
    displayName: "Your Favourite Map",
    img: "Play your #1 map multiple times to appreciate it a lil more.",
    mode: "",
    date_added: "",

    progress: {
        red: Object.fromEntries(
            Object.keys(maps[0].progress.red)
                .map(character => [character, 0])
        ),
        blu: Object.fromEntries(
            Object.keys(maps[0].progress.blu)
                .map(character => [character, 0])
        )
    }
};

    const STORAGE_KEY = "tf2-map-progress";
const savedProgress = JSON.parse(
    localStorage.getItem(STORAGE_KEY) || "{}"
);

let selectedMap = null;

// Get the saved progress, or use the JSON defaults.
function getProgress(map) {
    if (!savedProgress[map.name]) {
        savedProgress[map.name] = structuredClone(map.progress);
    }

    return savedProgress[map.name];
}


function isMapCompleted(map) {
    const progress = getProgress(map);

    return ["red", "blu"].every(team => {
        const counts = Object.values(progress[team]);

        return counts.length > 0 &&
            counts.every(count => count >= 1);
    });
}

function updateNodeBorder(map) {
    const node = cy.getElementById(map.name);

    if (node.length === 0) return;

    if (isMapCompleted(map)) {
        node.addClass("completed");
    } else {
        node.removeClass("completed");
    }
}

function updateAllNodeBorders() {
    for (const map of [...maps, favoriteMap]) {
        updateNodeBorder(map);
    }
}


function updateGlobalCompletion() {
    let completed = 0;
    let total = 0;

    // Include all actual maps and the favourite-map node.
    const allMaps = maps;

    for (const map of allMaps) {
        const progress = getProgress(map);
        let classes = 0;
        total++;

        for (const team of ["red", "blu"]) {
            for (const count of Object.values(progress[team])) {

                if (count >= 1) {
                    classes++;
                }
            }
        }

        if (classes >= 18)
        {
            completed++;
        }
    }

    const percentage = total > 0
        ? (completed / total) * 100
        : 0;

    document.getElementById("global-completion-text")
        .textContent =
        `${percentage.toFixed(1)}% (${completed}/${total})`;

    document.getElementById("global-completion-bar")
        .value = percentage;
}

function updateCompletion() {
    if (!selectedMap) return;

    const progress = getProgress(selectedMap);

    let completed = 0;
    let total = 0;

    // Check all classes across both teams.
    for (const team of ["red", "blu"]) {
        for (const count of Object.values(progress[team])) {
            total++;

            // One or more plays = completed.
            if (count >= 1) {
                completed++;
            }
        }
    }

    const percentage = total > 0
        ? (completed / total) * 100
        : 0;

    // Update the text.
    document.getElementById("completion-text")
        .textContent =
        `Completion: ${percentage.toFixed(1)}% (${completed}/${total})`;

    // Update the progress bar.
    document.getElementById("completion-bar")
        .value = percentage;

    updateAllNodeBorders();
}


// Save all progress in the browser.
function saveProgress() {
    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(savedProgress)
    );
}

// Generate the counter interface.

function renderProgress() {
    if (!selectedMap) return;

    const container = document.getElementById("class-progress");
    container.replaceChildren();

    const progress = getProgress(selectedMap);

    // Generate a separate column for each team.
    for (const team of ["red", "blu"]) {
        const teamProgress = progress[team];

        // Create team column.
        const column = document.createElement("div");
        column.className = `progress-team ${team}`;

        // Create team heading.
        const heading = document.createElement("h3");
        heading.textContent = team.toUpperCase();

        column.appendChild(heading);

        const resetButton = document.createElement("button");
        resetButton.textContent = "Reset " + team.toUpperCase();
        resetButton.className = "reset-button";
        resetButton.onclick = resetCount;
        column.appendChild(resetButton);

        function resetCount() {
            for (const character of Object.keys(teamProgress))
            {
                teamProgress[character] = 0;
            }

            saveProgress();
            renderProgress();
            updateCompletion();
            updateGlobalCompletion();
            updateNodeBorder(selectedMap);
            }

        // Generate counters for each character.
        for (const character of Object.keys(teamProgress)) {
            const row = document.createElement("div");
            row.className = "progress-row";

            const name = document.createElement("span");
            name.textContent = character;

            const counter = document.createElement("div");
            counter.className = "counter";

            const minus = document.createElement("button");
            minus.textContent = "−";

            const value = document.createElement("span");
            value.textContent = teamProgress[character];

            const plus = document.createElement("button");
            plus.textContent = "+";

            // Increment/decrement this team's count.
            function updateCount(amount) {
                teamProgress[character] = Math.max(
                    0,
                    teamProgress[character] + amount
                );

                value.textContent = teamProgress[character];

                saveProgress();
                updateCompletion();
                updateGlobalCompletion();
                updateNodeBorder(selectedMap);
            }

            minus.onclick = () => updateCount(-1);
            plus.onclick = () => updateCount(1);

            counter.append(minus, value, plus);
            row.append(name, counter);
            column.appendChild(row);
        }

        container.appendChild(column);

        updateCompletion();
    }
}


    console.log(`Loaded ${maps.length} maps`);

    // Default mode: randomized.
    const RANDOM_LAYOUT_KEY = "tf2-random-layout";

function randomLayout(regenerate = false) {
    let mapOrder = null;

    // Try loading the previously saved layout.
    if (!regenerate) {
        try {
            mapOrder = JSON.parse(
                localStorage.getItem(RANDOM_LAYOUT_KEY)
            );
        } catch (error) {
            console.warn("Invalid saved layout:", error);
        }
    }

    const mapNames = new Set(maps.map(map => map.name));

    // Validate the saved order against the current map list.
    const validOrder =
        Array.isArray(mapOrder) &&
        mapOrder.length === maps.length &&
        new Set(mapOrder).size === maps.length &&
        mapOrder.every(name => mapNames.has(name));

    // Generate a fresh layout if necessary.
    if (regenerate || !validOrder) {
        mapOrder = shuffle(maps.map(map => map.name));

        localStorage.setItem(
            RANDOM_LAYOUT_KEY,
            JSON.stringify(mapOrder)
        );
    }

    // Reconstruct map objects in their saved order.
    const mapLookup = new Map(
        maps.map(map => [map.name, map])
    );

    const randomized = mapOrder.map(
        name => mapLookup.get(name)
    );

    // Divide maps into groups of 14.
    const layers = [];

    for (let i = 0; i < randomized.length; i += 14) {
        layers.push(randomized.slice(i, i + 14));
    }

    drawGraph(layers);
    updateAllNodeBorders();
}

    function dateLayout() {
        const layers = groupByYear(maps);
        drawGraph(layers);
        updateAllNodeBorders();
    }

    document.getElementById("random-layout").addEventListener("click", () => {randomLayout(true);});

    document.getElementById("date-layout").addEventListener("click", dateLayout);

    document.getElementById("reset-global").addEventListener("click", resetAll);

    document.getElementById("reset-view").addEventListener("click", () => {cy.fit(cy.elements(), -4000);
});

    function resetTeamGlobally(team)
    {
        for (const map of [...maps, favoriteMap]) {
            const teamProgress = getProgress(map)[team];

            for (const character of Object.keys(teamProgress)) {
                teamProgress[character] = 0;
            }
        }

        saveProgress();
        renderProgress();
        updateCompletion();
        updateGlobalCompletion();
        updateAllNodeBorders();
    }

    function resetAll()
    {
        const confirmed = confirm(
            "Are you sure you want to reset ALL progress? " +
            "This will reset both teams across every map."
        );

        if (!confirmed) return;

        localStorage.removeItem(STORAGE_KEY);

        location.reload();
    }

cy.on("tap", "node", event => {
    const id = event.target.id();

    // Handle favourite map separately.
    if (id === ROOT_ID) {
        selectedMap = favoriteMap;
    } else {
        selectedMap = maps.find(map => map.name === id);
    }

    if (!selectedMap) return;

    const isFavorite = id === ROOT_ID;

    // Display name.
    document.getElementById("selected-map-name")
        .textContent = isFavorite
            ? "Your Favourite Map"
            : selectedMap.name;

    // Display mode.
    document.getElementById("map-mode")
        .textContent = isFavorite
            ? "Play your #1 map multiple times to appreciate it a lil more!"
            : "Mode: " + selectedMap.mode;

    // Display release date.
    document.getElementById("map-date")
        .textContent = isFavorite
            ? ""
            : "Added: " + selectedMap.date_added;

    // Display image only for actual maps.
    const image = document.getElementById("detail-image");

    if (isFavorite) {
        image.removeAttribute("src");
        image.style.display = "none";
    } else {
        image.src = selectedMap.img;
        image.alt = selectedMap.name;
        image.style.display = "block";
    }

    // Generate progress counters.
    renderProgress();
});


    randomLayout();
    updateGlobalCompletion();
}

main().catch(error => {
    console.error("Map tracker error:", error);
});
