
import * as THREE from "three";

export class VisualSim {
    private container: HTMLElement;
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private animationId: number | null = null;
    private clock: THREE.Clock;

    private gantry!: THREE.Group;
    private table!: THREE.Mesh;
    private patient!: THREE.Group;
    private scannerRing!: THREE.Mesh;
    private hotspotMeshes: THREE.Mesh[] = [];

    private defaultCameraPosition: THREE.Vector3;
    private defaultCameraLookAt: THREE.Vector3;
    private cameraTargetPosition: THREE.Vector3 | null = null;
    private cameraTargetLookAt: THREE.Vector3 | null = null;
    private highlightedMesh: THREE.Mesh | null = null;

    private isScanning: boolean = false;
    private tableZ: number = 0;
    private scanPhase: number = 0;
    private scanElapsed: number = 0;

    constructor(container: HTMLElement) {
        this.container = container;
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xf0f0f0); // Light gray background
        this.clock = new THREE.Clock();

        const width = container.clientWidth;
        const height = container.clientHeight;

        this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
        this.camera.position.set(2, 2, 4);
        this.camera.lookAt(0, 1, 0);
        this.defaultCameraPosition = this.camera.position.clone();
        this.defaultCameraLookAt = new THREE.Vector3(0, 1, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(width, height);
        container.appendChild(this.renderer.domElement);

        this.initLights();
        this.initObjects();
        this.addInteractions();
        this.bindResetButton();
        this.updateWorkflow(0, "Ready to begin. Click “Start CT Scan”.");

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
        this.registerHotspot(head, {
            title: "Head",
            description: "Brain, skull, and sinuses. CT reveals hemorrhage, trauma, and sinus disease.",
            attenuation: "High attenuation bone and low attenuation air spaces."
        });
        this.patient.add(head);

        // Body/Chest
        const bodyGeo = new THREE.CapsuleGeometry(0.2, 0.8, 4, 8);
        const body = new THREE.Mesh(bodyGeo, skinMat);
        body.rotation.x = Math.PI / 2;
        this.registerHotspot(body, {
            title: "Chest",
            description: "Lungs, heart, and ribs. CT explains lung detail and mediastinal anatomy.",
            attenuation: "Low attenuation air in lungs, high contrast for bone and vessels."
        });
        this.patient.add(body);

        // Arm
        const armGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.6, 16);
        const arm = new THREE.Mesh(armGeo, skinMat);
        arm.rotation.z = Math.PI / 2;
        arm.position.set(0.3, 0.05, -0.1);
        this.registerHotspot(arm, {
            title: "Arm",
            description: "Humerus and soft tissues. CT helps evaluate fractures and soft tissue injury.",
            attenuation: "Bone is high attenuation; muscle is mid attenuation."
        });
        this.patient.add(arm);

        // Legs (roughly)
        const legGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.9, 16);
        const legL = new THREE.Mesh(legGeo, skinMat);
        legL.rotation.x = Math.PI / 2;
        legL.position.set(-0.1, 0, 0.8);
        this.patient.add(legL);

        const legR = legL.clone();
        if (legR.material instanceof THREE.Material) {
            legR.material = legR.material.clone();
        }
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
            const intersects = raycaster.intersectObjects(this.hotspotMeshes);

            if (intersects.length > 0) {
                const object = intersects[0].object;
                this.showInfoPanel(object);
            } else {
                this.resetFocus();
            }
        });
    }

    private showInfoPanel(object: THREE.Object3D): void {
        const data = object.userData as { title?: string; description?: string; attenuation?: string };
        const title = document.getElementById("simInfoTitle");
        const text = document.getElementById("simInfoText");
        if (title) {
            title.textContent = data.title ? data.title : "Anatomical Focus";
        }
        if (text) {
            const details = [
                data.description,
                data.attenuation ? `Attenuation: ${data.attenuation}` : undefined,
            ].filter(Boolean);
            text.textContent = details.join(" ");
        }
        if (object instanceof THREE.Mesh) {
            this.highlightHotspot(object);
        }
        this.focusOn(object);
    }

    private bindResetButton(): void {
        const resetButton = document.getElementById("btnResetView");
        if (resetButton) {
            resetButton.addEventListener("click", () => this.resetFocus());
        }
    }

    private highlightHotspot(mesh: THREE.Mesh): void {
        if (this.highlightedMesh && this.highlightedMesh !== mesh) {
            this.resetHighlight(this.highlightedMesh);
        }
        this.highlightedMesh = mesh;
        const material = mesh.material;
        if (Array.isArray(material)) {
            return;
        }
        if (!mesh.userData.originalColor && material instanceof THREE.MeshPhongMaterial) {
            mesh.userData.originalColor = material.color.clone();
            mesh.userData.originalEmissive = material.emissive.clone();
        }
        if (material instanceof THREE.MeshPhongMaterial) {
            material.color = new THREE.Color(0x9f7aea);
            material.emissive = new THREE.Color(0x4c1d95);
            material.emissiveIntensity = 0.4;
        }
    }

    private resetHighlight(mesh: THREE.Mesh): void {
        const material = mesh.material;
        if (Array.isArray(material)) {
            return;
        }
        if (material instanceof THREE.MeshPhongMaterial && mesh.userData.originalColor) {
            material.color = mesh.userData.originalColor;
            material.emissive = mesh.userData.originalEmissive ?? new THREE.Color(0x000000);
            material.emissiveIntensity = 0;
        }
    }

    private focusOn(object: THREE.Object3D): void {
        const target = new THREE.Vector3();
        object.getWorldPosition(target);
        this.cameraTargetLookAt = target.clone();
        this.cameraTargetPosition = target.clone().add(new THREE.Vector3(1.4, 1.1, 1.6));
    }

    private resetFocus(): void {
        this.cameraTargetPosition = this.defaultCameraPosition.clone();
        this.cameraTargetLookAt = this.defaultCameraLookAt.clone();
        if (this.highlightedMesh) {
            this.resetHighlight(this.highlightedMesh);
            this.highlightedMesh = null;
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
        this.scanPhase = 0;
        this.scanElapsed = 0;
        this.tableZ = 2; // Start position
        this.table.position.z = this.tableZ;
        this.updateWorkflow(0, "Patient enters the room and approaches the scanner.");
    }

    private animate(): void {
        requestAnimationFrame(this.animate.bind(this));
        const delta = this.clock.getDelta();

        if (this.isScanning) {
            this.scanElapsed += delta;
            if (this.scanPhase === 0 && this.scanElapsed > 0.6) {
                this.scanPhase = 1;
                this.updateWorkflow(1, "Patient is positioned on the table.");
            }
            if (this.scanPhase === 1 && this.scanElapsed > 1.4) {
                this.scanPhase = 2;
                this.updateWorkflow(2, "Table moving into the gantry.");
            }

            // Rotate Gantry
            this.scannerRing.rotation.z += 0.1;

            // Move Table
            if (this.table.position.z > -1) {
                this.table.position.z -= 0.01;
                if (this.scanPhase === 2) {
                    this.scanPhase = 3;
                    this.updateWorkflow(3, "Scan in progress. X-ray source rotates.");
                }
            } else {
                this.isScanning = false;
                this.scannerRing.rotation.z = 0; // Reset
                this.updateWorkflow(4, "Scan complete. Review results.");
            }
        }

        if (this.cameraTargetPosition && this.cameraTargetLookAt) {
            this.camera.position.lerp(this.cameraTargetPosition, 0.08);
            const lookAtTarget = this.cameraTargetLookAt;
            this.camera.lookAt(lookAtTarget);
        }

        this.renderer.render(this.scene, this.camera);
    }

    private updateWorkflow(stepIndex: number, status: string): void {
        const steps = document.querySelectorAll<HTMLLIElement>("#simWorkflow li");
        steps.forEach((step, index) => {
            step.classList.toggle("is-active", index === stepIndex);
            step.classList.toggle("is-complete", index < stepIndex);
        });
        const statusElement = document.getElementById("simStatus");
        if (statusElement) {
            statusElement.textContent = status;
        }
    }

    private registerHotspot(mesh: THREE.Mesh, data: { title: string; description: string; attenuation: string; }): void {
        mesh.userData = data;
        this.hotspotMeshes.push(mesh);
    }
}
