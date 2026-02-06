
import * as THREE from "three";

export class VisualSim {
    private container: HTMLElement;
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private animationId: number | null = null;

    private gantry!: THREE.Group;
    private table!: THREE.Mesh;
    private patient!: THREE.Group;
    private scannerRing!: THREE.Mesh;

    private isScanning: boolean = false;
    private tableZ: number = 0;

    constructor(container: HTMLElement) {
        this.container = container;
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xf0f0f0); // Light gray background

        const width = container.clientWidth;
        const height = container.clientHeight;

        this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
        this.camera.position.set(2, 2, 4);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(width, height);
        container.appendChild(this.renderer.domElement);

        this.initLights();
        this.initObjects();
        this.addInteractions();

        window.addEventListener('resize', this.onWindowResize.bind(this), false);
        this.animate();
    }

    private initLights(): void {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 10, 7);
        this.scene.add(directionalLight);
    }

    private initObjects(): void {
        // Gantry Group
        this.gantry = new THREE.Group();
        this.scene.add(this.gantry);

        // Gantry Housing (Static)
        const housingGeo = new THREE.BoxGeometry(2, 2.5, 0.5);
        const housingMat = new THREE.MeshPhongMaterial({ color: 0xeeeeee });
        const housing = new THREE.Mesh(housingGeo, housingMat);
        housing.position.y = 1.25;

        // Cutout for ring (visual only, simple box doesn't have hole, using ring overlay)
        // For a better look, we'd use CSG or multiple boxes, but keeping it simple for now.
        // Let's make the scanner a Torus instead for the ring part.

        // Scanner Ring (Rotates)
        const ringGeo = new THREE.TorusGeometry(0.8, 0.2, 16, 50);
        const ringMat = new THREE.MeshPhongMaterial({ color: 0xcccccc });
        this.scannerRing = new THREE.Mesh(ringGeo, ringMat);
        this.scannerRing.position.y = 1.25;
        this.gantry.add(this.scannerRing);
        this.gantry.add(housing); // Add housing to gantry group

        // Table
        const tableGeo = new THREE.BoxGeometry(0.6, 0.1, 2.5);
        const tableMat = new THREE.MeshPhongMaterial({ color: 0x333333 });
        this.table = new THREE.Mesh(tableGeo, tableMat);
        this.table.position.set(0, 0.8, 2); // Start outside
        this.scene.add(this.table);

        // Patient
        this.patient = new THREE.Group();
        this.table.add(this.patient); // Patient moves with table
        this.patient.position.y = 0.15; // On top of table

        // Head
        const headGeo = new THREE.SphereGeometry(0.15, 32, 32);
        const skinMat = new THREE.MeshPhongMaterial({ color: 0xffccaa });
        const head = new THREE.Mesh(headGeo, skinMat);
        head.position.z = -0.8;
        head.userData = { name: "Head", info: "Brain, Skull, Sinuses. High attenuation bone, soft tissue brain." };
        this.patient.add(head);

        // Body/Chest
        const bodyGeo = new THREE.CapsuleGeometry(0.2, 0.8, 4, 8);
        const body = new THREE.Mesh(bodyGeo, skinMat);
        body.rotation.x = Math.PI / 2;
        body.userData = { name: "Chest", info: "Lungs, Heart, Ribs. Low attenuation air in lungs, high contrast bones." };
        this.patient.add(body);

        // Legs (roughly)
        const legGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.9, 16);
        const legL = new THREE.Mesh(legGeo, skinMat);
        legL.rotation.x = Math.PI / 2;
        legL.position.set(-0.1, 0, 0.8);
        legL.userData = { name: "Legs", info: "Femur, Tibia, Muscles. Bone fractures, soft tissue injuries." };
        this.patient.add(legL);

        const legR = legL.clone();
        legR.position.set(0.1, 0, 0.8);
        this.patient.add(legR);

        // Bed Stand
        const standGeo = new THREE.BoxGeometry(0.4, 0.8, 0.4);
        const standMat = new THREE.MeshPhongMaterial({ color: 0x888888 });
        const stand = new THREE.Mesh(standGeo, standMat);
        stand.position.set(0, 0.4, 2);
        this.scene.add(stand);
    }

    private addInteractions(): void {
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();

        this.renderer.domElement.addEventListener('click', (event) => {
            const rect = this.renderer.domElement.getBoundingClientRect();
            mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

            raycaster.setFromCamera(mouse, this.camera);
            const intersects = raycaster.intersectObjects(this.patient.children);

            if (intersects.length > 0) {
                const object = intersects[0].object;
                this.showTooltip(event.clientX, event.clientY, object.userData);
            } else {
                this.hideTooltip();
            }
        });
    }

    private showTooltip(x: number, y: number, data: any): void {
        let tooltip = document.getElementById("sim-tooltip");
        if (!tooltip) {
            tooltip = document.createElement("div");
            tooltip.id = "sim-tooltip";
            tooltip.style.position = "fixed";
            tooltip.style.backgroundColor = "white";
            tooltip.style.padding = "10px";
            tooltip.style.border = "1px solid #ccc";
            tooltip.style.borderRadius = "5px";
            tooltip.style.pointerEvents = "none";
            tooltip.style.zIndex = "1000";
            document.body.appendChild(tooltip);
        }
        tooltip.innerHTML = `<strong>${data.name}</strong><br>${data.info}`;
        tooltip.style.left = x + 10 + "px";
        tooltip.style.top = y + 10 + "px";
        tooltip.style.display = "block";
    }

    private hideTooltip(): void {
        const tooltip = document.getElementById("sim-tooltip");
        if (tooltip) {
            tooltip.style.display = "none";
        }
    }

    private onWindowResize(): void {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    public startScan(): void {
        if (this.isScanning) return;
        this.isScanning = true;
        this.tableZ = 2; // Start position
    }

    private animate(): void {
        requestAnimationFrame(this.animate.bind(this));

        if (this.isScanning) {
            // Rotate Gantry
            this.scannerRing.rotation.z += 0.1;

            // Move Table
            if (this.table.position.z > -1) {
                this.table.position.z -= 0.01;
            } else {
                this.isScanning = false;
                this.scannerRing.rotation.z = 0; // Reset
            }
        }

        this.renderer.render(this.scene, this.camera);
    }
}
