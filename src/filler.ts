import QEMUVM from "./QEMUVM.js";

const vm = new QEMUVM();

vm.on('vncconnect', () => {
    console.log("VNC Connected");
    sendAnimeBetrayals();
});

function sendAnimeBetrayals() {
    const message = "Top 10 Anime Betrayals";
    console.log("Sending:", message);
}

vm.start()
    .catch((error) => {
        console.error("Error starting VM:", error);
    });
