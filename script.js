/*********************************************
 * ARCADE RACING PORTFOLIO MINIGAME (OPTIMIZED)
 * Built using Vanilla JS & Three.js
 *********************************************/
(function () {
  const CONFIG = {
    acceleration: 25,
    maxSpeed: 30,
    reverseMaxSpeed: -10,
    turnSpeed: 2.2,
    drag: 0.96,
    brakingDrag: 0.9,
    targetZone: { x: 0, z: -180, triggerWidth: 20, triggerDepth: 4 },
    spawnPoint: { x: 0, y: 0, z: 10, heading: 0 },
    camera: {
      offset: new THREE.Vector3(0, 5, 14),
      introOffset: new THREE.Vector3(0, 35, 55), // Overhead camera starting position
      lerpFactor: 0.08,
    },
    track: { length: 250, width: 30, boundaryMargin: 1.2 },
  };

  let scene, camera, renderer;
  let carGroup,
    wheels = [];
  let carBodyMesh;
  let finishArchway, particleSystem;
  let animationFrameId;
  let keyDownHandler, keyUpHandler;
  const keys = { up: false, down: false, left: false, right: false };
  const carPhysics = { speed: 0, heading: CONFIG.spawnPoint.heading };
  let isUnlocked = false;
  let isRespawning = false;
  let isGameRunning = true; // Control flag to kill render loop

  // Fly-in Intro Animation variables
  let isIntroAnimating = true;
  let introProgress = 0;
  const INTRO_DURATION = 2.2; // Duration in seconds

  // Shadow camera reference
  let sunLight;

  function init() {
    const container = document.getElementById("canvas-container");
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0c10);
    scene.fog = new THREE.FogExp2(0x0b0c10, 0.015);

    camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );

    renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    setupLighting();
    buildEnvironment();
    buildCar();
    buildFinishArchway();
    setupControls();

    window.addEventListener("resize", onWindowResize, false);

    let lastTime = performance.now();
    function animate(currentTime) {
      if (!isGameRunning) return; // Exit loop completely once unlocked

      animationFrameId = requestAnimationFrame(animate);
      const deltaTime = Math.min((currentTime - lastTime) / 1000, 0.1);
      lastTime = currentTime;

      if (!isUnlocked) {
        if (isIntroAnimating) {
          updateIntroCamera(deltaTime);
        } else {
          if (!isRespawning) {
            updatePhysics(deltaTime);
            checkCollision();
          }
          updateCamera();
        }
      } else {
        updateCinematicCamera(deltaTime);
      }

      // DYNAMIC SHADOW: follow car
      if (sunLight && carGroup) {
        sunLight.position
          .copy(carGroup.position)
          .add(new THREE.Vector3(30, 50, 20));
        sunLight.target.position.copy(carGroup.position);
        sunLight.target.updateMatrixWorld();
      }

      if (particleSystem) {
        particleSystem.rotation.z += 0.01;
      }

      renderer.render(scene, camera);
    }
    animate(performance.now());
  }

  function setupLighting() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
    sunLight.position.set(40, 60, 20);
    sunLight.castShadow = true;

    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;

    const shadowSize = 40;
    sunLight.shadow.camera.left = -shadowSize;
    sunLight.shadow.camera.right = shadowSize;
    sunLight.shadow.camera.top = shadowSize;
    sunLight.shadow.camera.bottom = -shadowSize;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 300;
    sunLight.shadow.bias = -0.0005;

    scene.add(sunLight);
    scene.add(sunLight.target);
  }

  function buildEnvironment() {
    const groundGeo = new THREE.PlaneGeometry(500, 500);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x07080a,
      roughness: 0.9,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    scene.add(ground);

    const trackGeo = new THREE.PlaneGeometry(
      CONFIG.track.width,
      CONFIG.track.length,
    );
    const trackMat = new THREE.MeshStandardMaterial({
      color: 0x1f2833,
      roughness: 0.4,
    });
    const track = new THREE.Mesh(trackGeo, trackMat);
    track.rotation.x = -Math.PI / 2;
    track.position.set(0, 0.01, -CONFIG.track.length / 2 + 20);
    track.receiveShadow = true;
    scene.add(track);

    const wallHeight = 2.0;
    const wallThickness = 1.2;
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a212d,
      metalness: 0.6,
      roughness: 0.2,
    });
    const neonMaterial = new THREE.MeshBasicMaterial({ color: 0x66fcf1 });

    const halfWidth = CONFIG.track.width / 2;

    [-halfWidth, halfWidth].forEach((xPos) => {
      const wallGeo = new THREE.BoxGeometry(
        wallThickness,
        wallHeight,
        CONFIG.track.length,
      );
      const wall = new THREE.Mesh(wallGeo, wallMaterial);
      wall.position.set(xPos, wallHeight / 2, -CONFIG.track.length / 2 + 20);
      wall.castShadow = true;
      wall.receiveShadow = true;
      scene.add(wall);

      const railGeo = new THREE.BoxGeometry(
        wallThickness * 0.4,
        0.2,
        CONFIG.track.length,
      );
      const rail = new THREE.Mesh(railGeo, neonMaterial);
      rail.position.set(xPos, wallHeight + 0.1, -CONFIG.track.length / 2 + 20);
      rail.castShadow = false;
      rail.receiveShadow = false;
      scene.add(rail);
    });

    const backWallLength = CONFIG.track.width + wallThickness * 2;
    const backWallGeo = new THREE.BoxGeometry(
      backWallLength,
      wallHeight,
      wallThickness,
    );
    const backWall = new THREE.Mesh(backWallGeo, wallMaterial);
    backWall.position.set(0, wallHeight / 2, 25);
    backWall.castShadow = true;
    backWall.receiveShadow = true;
    scene.add(backWall);

    const propCount = 15;
    const spacing = CONFIG.track.length / propCount;

    for (let i = 0; i < propCount; i++) {
      const zPos = -i * spacing + 10;

      [-halfWidth * 1.15, halfWidth * 1.15].forEach((xPos) => {
        const poleGeo = new THREE.CylinderGeometry(0.1, 0.1, 6);
        const poleMat = new THREE.MeshStandardMaterial({
          color: 0x45a29e,
          roughness: 0.5,
        });
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(xPos, 3, zPos);
        pole.castShadow = false;
        pole.receiveShadow = false;
        scene.add(pole);

        const bulbGeo = new THREE.SphereGeometry(0.3, 8, 8);
        const bulbMat = new THREE.MeshBasicMaterial({ color: 0x66fcf1 });
        const bulb = new THREE.Mesh(bulbGeo, bulbMat);
        bulb.position.set(xPos, 6, zPos);
        bulb.castShadow = false;
        bulb.receiveShadow = false;
        scene.add(bulb);
      });
    }
  }

  function buildCar() {
    carGroup = new THREE.Group();

    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0xe5243b,
      roughness: 0.3,
      metalness: 0.2,
    });
    const cabinMaterial = new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.1,
    });
    const wheelMaterial = new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.8,
    });

    const bodyGeo = new THREE.BoxGeometry(2.2, 0.7, 4.4);
    carBodyMesh = new THREE.Mesh(bodyGeo, bodyMaterial);
    carBodyMesh.position.y = 0.6;
    carBodyMesh.castShadow = true;
    carBodyMesh.receiveShadow = true;
    carGroup.add(carBodyMesh);

    const cabinGeo = new THREE.BoxGeometry(1.6, 0.6, 2.2);
    const cabin = new THREE.Mesh(cabinGeo, cabinMaterial);
    cabin.position.set(0, 1.15, -0.2);
    cabin.castShadow = true;
    cabin.receiveShadow = true;
    carGroup.add(cabin);

    const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16);
    wheelGeo.rotateZ(Math.PI / 2);

    const wheelPositions = [
      { x: -1.2, y: 0.4, z: 1.3 },
      { x: 1.2, y: 0.4, z: 1.3 },
      { x: -1.2, y: 0.4, z: -1.3 },
      { x: 1.2, y: 0.4, z: -1.3 },
    ];

    wheels = wheelPositions.map((pos) => {
      const wheel = new THREE.Mesh(wheelGeo, wheelMaterial);
      wheel.position.set(pos.x, pos.y, pos.z);
      wheel.castShadow = true;
      wheel.receiveShadow = true;
      carGroup.add(wheel);
      return wheel;
    });

    carGroup.position.set(
      CONFIG.spawnPoint.x,
      CONFIG.spawnPoint.y,
      CONFIG.spawnPoint.z,
    );
    scene.add(carGroup);
  }

  function createCheckeredTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    const size = 32;
    for (let x = 0; x < canvas.width; x += size) {
      for (let y = 0; y < canvas.height; y += size) {
        ctx.fillStyle = (x / size + y / size) % 2 === 0 ? "#ffffff" : "#000000";
        ctx.fillRect(x, y, size, size);
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  function createNeonTextTexture(text) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '900 72px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "#66fcf1";
    ctx.shadowBlur = 20;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    ctx.shadowBlur = 10;
    ctx.fillStyle = "#66fcf1";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    return new THREE.CanvasTexture(canvas);
  }

  function buildFinishArchway() {
    finishArchway = new THREE.Group();
    const { x, z } = CONFIG.targetZone;
    const archWidth = 22;
    const archHeight = 12;
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x1f2833,
      metalness: 0.8,
      roughness: 0.2,
    });
    const neonMat = new THREE.MeshBasicMaterial({ color: 0x66fcf1 });

    [-archWidth / 2, archWidth / 2].forEach((pX) => {
      const pillarGeo = new THREE.BoxGeometry(2, archHeight, 2);
      const pillar = new THREE.Mesh(pillarGeo, frameMat);
      pillar.position.set(pX, archHeight / 2, 0);
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      finishArchway.add(pillar);

      const neonStripGeo = new THREE.BoxGeometry(0.4, archHeight, 0.4);
      const neonStrip = new THREE.Mesh(neonStripGeo, neonMat);
      neonStrip.position.set(
        pX > 0 ? pX - 1.1 : pX + 1.1,
        archHeight / 2,
        1.05,
      );
      neonStrip.castShadow = false;
      neonStrip.receiveShadow = false;
      finishArchway.add(neonStrip);
    });

    const beamGeo = new THREE.BoxGeometry(archWidth, 2, 2);
    const beam = new THREE.Mesh(beamGeo, frameMat);
    beam.position.set(0, archHeight, 0);
    beam.castShadow = true;
    beam.receiveShadow = true;
    finishArchway.add(beam);

    const neonTextTex = createNeonTextTexture("RIZZAL");
    const signGeo = new THREE.PlaneGeometry(16, 4);
    const signMat = new THREE.MeshBasicMaterial({
      map: neonTextTex,
      transparent: true,
      side: THREE.DoubleSide,
    });
    const signMesh = new THREE.Mesh(signGeo, signMat);
    signMesh.position.set(0, archHeight + 3, 0);
    signMesh.castShadow = false;
    signMesh.receiveShadow = false;
    finishArchway.add(signMesh);

    const checkeredTexture = createCheckeredTexture();
    checkeredTexture.repeat.set(8, 1);
    const lineGeo = new THREE.PlaneGeometry(archWidth - 2, 4);
    const lineMat = new THREE.MeshBasicMaterial({
      map: checkeredTexture,
      side: THREE.DoubleSide,
    });
    const finishLine = new THREE.Mesh(lineGeo, lineMat);
    finishLine.rotation.x = -Math.PI / 2;
    finishLine.position.set(0, 0.02, 0);
    finishLine.castShadow = false;
    finishLine.receiveShadow = false;
    finishArchway.add(finishLine);

    const particleCount = 120;
    const particleGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI;
      const radius = archWidth / 2 - 0.5;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = Math.sin(angle) * (archHeight - 2) + 2;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 3;
    }
    particleGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3),
    );
    const particleMat = new THREE.PointsMaterial({
      color: 0x66fcf1,
      size: 0.6,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
    });
    particleSystem = new THREE.Points(particleGeo, particleMat);
    finishArchway.add(particleSystem);

    finishArchway.position.set(x, 0, z);
    scene.add(finishArchway);
  }

  function setupControls() {
    const onKey = (val) => (e) => {
      switch (e.code) {
        case "KeyW":
        case "ArrowUp":
          keys.up = val;
          break;
        case "KeyS":
        case "ArrowDown":
          keys.down = val;
          break;
        case "KeyA":
        case "ArrowLeft":
          keys.left = val;
          break;
        case "KeyD":
        case "ArrowRight":
          keys.right = val;
          break;
      }
    };
    keyDownHandler = onKey(true);
    keyUpHandler = onKey(false);
    window.addEventListener("keydown", keyDownHandler);
    window.addEventListener("keyup", keyUpHandler);
  }

  function removeControls() {
    keys.up = keys.down = keys.left = keys.right = false;
    window.removeEventListener("keydown", keyDownHandler);
    window.removeEventListener("keyup", keyUpHandler);
  }

  function updateIntroCamera(deltaTime) {
    introProgress += deltaTime / INTRO_DURATION;

    if (introProgress >= 1.0) {
      introProgress = 1.0;
      isIntroAnimating = false; // Intro finished -> enables driving controls
    }

    // Smooth cubic ease-out curve
    const easeProgress = 1 - Math.pow(1 - introProgress, 3);

    const currentOffset = new THREE.Vector3().lerpVectors(
      CONFIG.camera.introOffset,
      CONFIG.camera.offset,
      easeProgress,
    );

    const targetCameraPos = carGroup.position.clone().add(currentOffset);
    camera.position.copy(targetCameraPos);
    camera.lookAt(carGroup.position.clone().add(new THREE.Vector3(0, 1.2, 0)));
  }

  function updatePhysics(deltaTime) {
    if (isIntroAnimating) return;

    if (keys.up) {
      carPhysics.speed += CONFIG.acceleration * deltaTime;
    } else if (keys.down) {
      carPhysics.speed -= CONFIG.acceleration * deltaTime;
    } else {
      carPhysics.speed *= CONFIG.drag;
    }

    if (keys.down && carPhysics.speed > 0) {
      carPhysics.speed *= CONFIG.brakingDrag;
    }

    carPhysics.speed = THREE.MathUtils.clamp(
      carPhysics.speed,
      CONFIG.reverseMaxSpeed,
      CONFIG.maxSpeed,
    );

    if (Math.abs(carPhysics.speed) > 0.1) {
      const turnDirection = carPhysics.speed > 0 ? 1 : -1;
      if (keys.left)
        carPhysics.heading += CONFIG.turnSpeed * turnDirection * deltaTime;
      if (keys.right)
        carPhysics.heading -= CONFIG.turnSpeed * turnDirection * deltaTime;
    }

    carGroup.rotation.y = carPhysics.heading;
    const moveDistance = -carPhysics.speed * deltaTime;
    const nextX =
      carGroup.position.x + Math.sin(carPhysics.heading) * moveDistance;
    const nextZ =
      carGroup.position.z + Math.cos(carPhysics.heading) * moveDistance;

    const maxRoadWidth = CONFIG.track.width / 2 - CONFIG.track.boundaryMargin;
    const maxRoadBack = 22;
    const roadEndGoal = -CONFIG.track.length + 10;

    if (Math.abs(nextX) > maxRoadWidth) {
      carGroup.position.x = Math.sign(nextX) * maxRoadWidth;
      carPhysics.speed *= 0.2;
    } else {
      carGroup.position.x = nextX;
    }

    if (nextZ > maxRoadBack) {
      carGroup.position.z = maxRoadBack;
      carPhysics.speed = 0;
    } else {
      carGroup.position.z = nextZ;
    }

    if (carGroup.position.z < roadEndGoal) {
      triggerRespawnAnimation();
    }

    wheels.forEach((wheel) => {
      wheel.rotation.x -= (carPhysics.speed * deltaTime) / 0.4;
    });
  }

  function triggerRespawnAnimation() {
    if (isRespawning) return;
    isRespawning = true;
    carPhysics.speed = 0;

    const respawnAlert = document.getElementById("respawn-alert");
    respawnAlert.classList.add("active");
    let flashCount = 0;
    const originalColor = new THREE.Color(0xe5243b);
    const flashColor = new THREE.Color(0x66fcf1);
    const interval = setInterval(() => {
      flashCount++;
      carBodyMesh.material.color =
        flashCount % 2 === 1 ? flashColor : originalColor;
      if (flashCount >= 6) {
        clearInterval(interval);
        carGroup.position.set(
          CONFIG.spawnPoint.x,
          CONFIG.spawnPoint.y,
          CONFIG.spawnPoint.z,
        );
        carPhysics.heading = CONFIG.spawnPoint.heading;
        carGroup.rotation.y = CONFIG.spawnPoint.heading;
        carBodyMesh.material.color = originalColor;
        respawnAlert.classList.remove("active");
        isRespawning = false;
      }
    }, 100);
  }

  function updateCamera() {
    const relativeOffset = CONFIG.camera.offset
      .clone()
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), carGroup.rotation.y);
    const targetCameraPos = carGroup.position.clone().add(relativeOffset);
    camera.position.lerp(targetCameraPos, CONFIG.camera.lerpFactor);
    camera.lookAt(carGroup.position.clone().add(new THREE.Vector3(0, 1.2, 0)));
  }

  function updateCinematicCamera(deltaTime) {
    carGroup.translateZ(-45 * deltaTime);
    const targetCamPos = finishArchway.position
      .clone()
      .add(new THREE.Vector3(0, 4, 12));
    camera.position.lerp(targetCamPos, 0.1);
    camera.lookAt(
      finishArchway.position.clone().add(new THREE.Vector3(0, 4, -20)),
    );
  }

  function checkCollision() {
    const archZ = CONFIG.targetZone.z;
    const halfWidth = CONFIG.targetZone.triggerWidth / 2;
    const carX = carGroup.position.x;
    const carZ = carGroup.position.z;
    if (Math.abs(carX) <= halfWidth && carZ <= archZ + 2 && carZ >= archZ - 6) {
      triggerUnlockSequence();
    }
  }

  function disposeMaterial(mat) {
    mat.dispose();
    if (mat.map) mat.map.dispose();
    if (mat.lightMap) mat.lightMap.dispose();
    if (mat.bumpMap) mat.bumpMap.dispose();
    if (mat.normalMap) mat.normalMap.dispose();
    if (mat.specularMap) mat.specularMap.dispose();
    if (mat.envMap) mat.envMap.dispose();
  }

  function destroyThreeJS() {
    isGameRunning = false;
    if (animationFrameId) cancelAnimationFrame(animationFrameId);

    window.removeEventListener("resize", onWindowResize);

    scene.traverse((object) => {
      if (!object.isMesh) return;
      if (object.geometry) object.geometry.dispose();

      if (object.material) {
        if (Array.isArray(object.material)) {
          object.material.forEach((mat) => disposeMaterial(mat));
        } else {
          disposeMaterial(object.material);
        }
      }
    });

    renderer.dispose();
    renderer.forceContextLoss();

    const container = document.getElementById("canvas-container");
    if (container) container.remove();
  }

  function triggerUnlockSequence() {
    isUnlocked = true;
    removeControls();

    const hud = document.getElementById("hud");
    const flashOverlay = document.getElementById("flash-overlay");
    const canvasContainer = document.getElementById("canvas-container");
    const portfolioContent = document.getElementById("portfolio-content");
    const cursorGlow = document.getElementById("cursor-glow");

    hud.style.opacity = "0";
    setTimeout(() => {
      flashOverlay.classList.add("active");
    }, 300);
    setTimeout(() => {
      canvasContainer.classList.add("fade-out");
      portfolioContent.classList.add("visible");
      if (cursorGlow) cursorGlow.classList.add("active");
      if (window.initScrollReveal) window.initScrollReveal();
    }, 700);
    setTimeout(() => {
      flashOverlay.classList.remove("active");
      destroyThreeJS(); // Terminate Three.js & unbind canvas
    }, 1500);
  }

  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  window.addEventListener("DOMContentLoaded", init);
})();

/*********************************************
 * PORTFOLIO INTERACTIONS & CURSOR GLOW
 *********************************************/
document.addEventListener("DOMContentLoaded", function () {
  const cursorGlow = document.getElementById("cursor-glow");
  const portfolioContent = document.getElementById("portfolio-content");
  let glowActive = false;
  let mouseX = -500,
    mouseY = -500,
    currentX = -500,
    currentY = -500;

  // Track cursor position
  document.addEventListener("mousemove", (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  // Smooth continuous animation loop for cursor glow
  function animateGlow() {
    if (glowActive) {
      currentX += (mouseX - currentX) * 0.12;
      currentY += (mouseY - currentY) * 0.12;
      cursorGlow.style.left = currentX + "px";
      cursorGlow.style.top = currentY + "px";
    }
    requestAnimationFrame(animateGlow);
  }
  animateGlow();

  // Observer to toggle cursor glow when portfolio view is visible
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (
        mutation.target === portfolioContent &&
        mutation.attributeName === "class"
      ) {
        if (portfolioContent.classList.contains("visible")) {
          glowActive = true;
          cursorGlow.classList.add("active");
          initScrollReveal();
        } else {
          glowActive = false;
          cursorGlow.classList.remove("active");
        }
      }
    });
  });
  observer.observe(portfolioContent, {
    attributes: true,
    attributeFilter: ["class"],
  });

  if (portfolioContent.classList.contains("visible")) {
    glowActive = true;
    cursorGlow.classList.add("active");
  }

  function initCardTilt() {
    const cards = document.querySelectorAll("#portfolio-content .card");
    cards.forEach((card) => {
      let ticking = false;

      card.addEventListener("mousemove", (e) => {
        if (!ticking) {
          requestAnimationFrame(() => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const rotateX = ((y - centerY) / centerY) * -6;
            const rotateY = ((x - centerX) / centerX) * 6;
            card.style.transform = `scale(1.05) translateY(-6px) perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
            ticking = false;
          });
          ticking = true;
        }
      });

      card.addEventListener("mouseleave", () => {
        card.style.transform = "";
      });
    });
  }

  function initScrollReveal() {
    const reveals = document.querySelectorAll(
      "#portfolio-content .reveal:not(.revealed)",
    );
    if (reveals.length === 0) return;
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("revealed");
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, root: portfolioContent },
    );
    reveals.forEach((el) => revealObserver.observe(el));
  }

  function initProfilePop() {
    const profileWrapper = document.querySelector(".profile-image-wrapper");
    if (!profileWrapper) return;
    profileWrapper.addEventListener("mousedown", () => {
      profileWrapper.style.transform = "scale(0.9)";
      profileWrapper.style.transition =
        "transform 0.12s cubic-bezier(0.34, 1.56, 0.64, 1)";
    });
    profileWrapper.addEventListener("mouseup", () => {
      profileWrapper.style.transform = "scale(1.08)";
      profileWrapper.style.transition =
        "transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)";
    });
    profileWrapper.addEventListener("mouseleave", () => {
      profileWrapper.style.transform = "";
      profileWrapper.style.transition =
        "transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)";
    });
  }

  initCardTilt();
  initProfilePop();
  initScrollReveal();

  portfolioContent.addEventListener("transitionend", () => {
    if (portfolioContent.classList.contains("visible")) {
      initScrollReveal();
      initCardTilt();
    }
  });

  window.initScrollReveal = initScrollReveal;
});
