"use client";

import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { TextureLoader, SRGBColorSpace, Group } from "three";
import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import * as THREE from "three";

import CountryBorders from "./CountryBorders";
import CountryLabels from "./CountryLabels";
import { useCountryClick } from "../hooks/CountryClick";
import CountryInfoPanel from "./CountryInfoPanel";
import SocialPanel from "./SocialPanel";
import CreateTripModal from "./CreateTripModal";
import { getCountriesGeoJSON } from "../lib/countriesGeo";

/** ---------- Earth ---------- */
function Earth({ isDark }: { isDark: boolean }) {
  const [dayTexture, nightTexture] = useLoader(TextureLoader, [
    "/textures/earth.jpg",
    "/textures/earth_night.jpg",
  ]);
  dayTexture.colorSpace = SRGBColorSpace;
  nightTexture.colorSpace = SRGBColorSpace;

  return (
    <mesh visible>
      <sphereGeometry args={[1.2, 96, 96]} />
      <meshStandardMaterial
        map={isDark ? nightTexture : dayTexture}
        roughness={1}
        metalness={0}
        emissive={isDark ? "#000000" : "#a3b3ff"}
        emissiveIntensity={isDark ? 0 : 0.045}
        depthWrite
        depthTest
      />
    </mesh>
  );
}

/** ---------- Math helpers ---------- */
function slerpDir(a: THREE.Vector3, b: THREE.Vector3, t: number) {
  const v0 = a.clone().normalize();
  const v1 = b.clone().normalize();
  const dot = THREE.MathUtils.clamp(v0.dot(v1), -1, 1);
  const theta = Math.acos(dot);
  if (theta < 1e-6) return v1.clone();

  const sinTheta = Math.sin(theta);
  const w0 = Math.sin((1 - t) * theta) / sinTheta;
  const w1 = Math.sin(t * theta) / sinTheta;

  return v0.multiplyScalar(w0).add(v1.multiplyScalar(w1)).normalize();
}


function hardResetOrbitDeltas(controls: any) {
  if (!controls) return;

  try {
    controls.target?.set?.(0, 0, 0);

    if (controls.sphericalDelta?.set) controls.sphericalDelta.set(0, 0, 0);
    if (controls.panOffset?.set) controls.panOffset.set(0, 0, 0);

    if (typeof controls.zoomChanged === "boolean") controls.zoomChanged = false;

    if (controls._sphericalDelta?.set) controls._sphericalDelta.set(0, 0, 0);
    if (controls._panOffset?.set) controls._panOffset.set(0, 0, 0);

    controls.update?.();
  } catch {
    // safe no-op
  }
}


function adjustDirToPlaceTargetAtNDC(params: {
  dir: THREE.Vector3; // front direction
  camRadius: number; // camera distance from origin
  targetWorld: THREE.Vector3; // desired center point
  camera: THREE.PerspectiveCamera;
  desiredNDC: THREE.Vector2;
}) {
  const { dir, camRadius, targetWorld, camera, desiredNDC } = params;

  // Start from base camera position along dir
  const pos = dir.clone().multiplyScalar(camRadius);

  // Iterative yaw/pitch correction
  const tmpCam = camera.clone() as THREE.PerspectiveCamera;
  tmpCam.position.copy(pos);
  tmpCam.lookAt(0, 0, 0);
  tmpCam.updateMatrixWorld(true);

  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3();

  const p = targetWorld.clone();
  const proj = new THREE.Vector3();

  for (let i = 0; i < 10; i++) {
    tmpCam.updateMatrixWorld(true);

    proj.copy(p).project(tmpCam);
    const errX = proj.x - desiredNDC.x;
    const errY = proj.y - desiredNDC.y;

    if (Math.abs(errX) < 0.002 && Math.abs(errY) < 0.002) break;

    right.set(1, 0, 0).applyQuaternion(tmpCam.quaternion);


    const yaw = errX * 0.35;   // tweak constants
    const pitch = -errY * 0.35;

    pos.applyAxisAngle(up, yaw);
    pos.applyAxisAngle(right, pitch);

    tmpCam.position.copy(pos);
    tmpCam.lookAt(0, 0, 0);
  }

  return pos.normalize(); // return adjusted direction
}

/** ---------- RotatingGroup ---------- */
function RotatingGroup({
  isDark,
  isRotationEnabled,
  onCountrySelect,
  focus,
  controlsRef,
}: {
  isDark: boolean;
  isRotationEnabled: boolean;
  onCountrySelect: (name: string, hitPoint: THREE.Vector3) => void;
  focus: { name: string; nonce: number; hitPoint?: THREE.Vector3 } | null;
  controlsRef: React.RefObject<any>;
}) {
  const groupRef = useRef<Group>(null);
  const bordersGroupRef = useRef<THREE.Group>(null);
  const { camera, size } = useThree();
  const focusSeq = useRef(0);

  const DEFAULT_CAMERA_DIR = useMemo(
    () => new THREE.Vector3(35, 30, 4).normalize(),
    []
  );
  const DEFAULT_CAMERA_RADIUS = 3.4;

// tween state
const startRadiusRef = useRef(0);

  const raycaster = useMemo(() => new THREE.Raycaster(), []);


  // Clicks provide exact hitPoint
  useCountryClick(onCountrySelect);

  // tween state
  const fromDir = useRef(new THREE.Vector3(0, 0, 1));
  const toDir = useRef(new THREE.Vector3(0, 0, 1));
  const t = useRef(1);
  const targetRadiusRef = useRef<number | null>(null);
  const targetPointRef = useRef<THREE.Vector3 | null>(null);

  function applyCountryBias(name: string, dir: THREE.Vector3): THREE.Vector3 {
  const n = name.trim().toLowerCase();
  const d = dir.clone().normalize();

  if (n === "russia") {
    // Bias towards the west side of Russia.
    const WEST_BIAS_YAW = -0.95;
    d.applyAxisAngle(new THREE.Vector3(0, 1, 0), WEST_BIAS_YAW).normalize();
  }

  return d;
}

  // ----- Find mesh by name -----
  function findCountryMesh(root: THREE.Object3D, name: string): THREE.Mesh | null {
    let found: THREE.Mesh | null = null;
    root.traverse((obj) => {
      if (found) return;
      if ((obj as any).isMesh && (obj as any).userData?.countryName === name) {
        found = obj as THREE.Mesh;
      }
    });
    return found;
  }

function computeSearchHitPoint(name: string): THREE.Vector3 | null {
  const root = bordersGroupRef.current;
  if (!root) return null;

  const key = name.trim();

  const centers = root.userData?.countryCenters as Record<string, THREE.Vector3> | undefined;
  const centerDir = centers?.[key] ?? centers?.[key.toLowerCase()];

  // If we don't even have a center direction, bail
  if (!centerDir) return null;

  // Try to raycast into the specific country mesh first
  const mesh = findCountryMesh(root, key) ?? findCountryMesh(root, key.toLowerCase());

  if (mesh) {
    // Ray from far outside towards origin along that direction
    const origin = centerDir.clone().multiplyScalar(50); // was 10
    const direction = centerDir.clone().multiplyScalar(-1).normalize();

    raycaster.set(origin, direction);
    const hits = raycaster.intersectObject(mesh, true);
    if (hits.length) return hits[0].point.clone();
  }

  // ---- FALLBACK ----
  // If raycast misses use a point on the globe surface.
  //sphere radius is 1.2
  return centerDir.clone().normalize().multiplyScalar(1.2);
}

  async function getZoomForCountry(name: string): Promise<number> {
    const data = await getCountriesGeoJSON();
    const f = (data.features || []).find((x: any) => x?.properties?.name === name);
    if (!f) return 3.0;

    const area = f.properties?.area || 1_000_000;

    const minZoom = 2.0;
    const maxZoom = 3.3;
    const logArea = Math.log10(area + 1);
    const normalized = 1 / (1 + Math.exp(-(logArea - 6.5)));
    const zoom = minZoom + normalized * (maxZoom - minZoom);

    if (["Australia", "Russia", "Canada", "United States", "China", "Brazil"].includes(name)) {
      return Math.min(zoom + 0.2, maxZoom);
    }
    return zoom;
  }

  useEffect(() => {
    const resetCamera = () => {
      const controls = controlsRef.current;

      // stop any active tween
      t.current = 1;
      targetRadiusRef.current = null;
      targetPointRef.current = null;

      const resetPos = DEFAULT_CAMERA_DIR.clone().multiplyScalar(DEFAULT_CAMERA_RADIUS);

      camera.position.copy(resetPos);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);

      if (controls) {
        controls.enabled = true;
        controls.target.set(0, 0, 0);

        if ("autoRotate" in controls) controls.autoRotate = false;

        hardResetOrbitDeltas(controls);
        controls.update();
      }
    };

    window.addEventListener("reset-globe-camera", resetCamera);
    return () => {
      window.removeEventListener("reset-globe-camera", resetCamera);
    };
  }, [camera, controlsRef, DEFAULT_CAMERA_DIR]);
  
  /** Focus effect */
useEffect(() => {
  (async () => {
    if (!focus) return;

    const { name, hitPoint } = focus;
    const seq = ++focusSeq.current;

    const controls = controlsRef.current;
    const dirNow = camera.position.clone().normalize();
    const radiusNow = camera.position.length();

    if (controls) {
      controls.enabled = false;
      controls.target.set(0, 0, 0);
      hardResetOrbitDeltas(controls);
    }

    // Wait for borders mesh to exist
    const start = performance.now();
    while (!bordersGroupRef.current && performance.now() - start < 2000) {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
    if (seq !== focusSeq.current) return;

    const targetPoint =
      hitPoint?.clone() ??
      computeSearchHitPoint(name);

    if (!targetPoint) {
      if (controls) controls.enabled = true;
      return;
    }

    const zoom = await getZoomForCountry(name);
    if (seq !== focusSeq.current) return;

    // Direction vectors
    const dirNextRaw = targetPoint.clone().normalize();
    const dirNext = applyCountryBias(name, dirNextRaw);

    fromDir.current.copy(dirNow);
    toDir.current.copy(dirNext);


    startRadiusRef.current = radiusNow;
    targetRadiusRef.current = zoom;

    targetPointRef.current = targetPoint.clone();

    // Start animation
    t.current = 0;
  })();
}, [focus?.nonce, focus?.name]);

useFrame((_, delta) => {
  if (t.current >= 1) return;

  const dt = Math.min(delta, 0.03); // clamp to avoid jumps
  t.current = Math.min(1, t.current + dt * 0.25); // slower blend
  const k = t.current * t.current * (3 - 2 * t.current); // smoothstep

  const controls = controlsRef.current;

  // Zoom interpolation
  const currentRadius = camera.position.length();
  const targetRadius = targetRadiusRef.current ?? currentRadius;
  const radius = THREE.MathUtils.lerp(
    currentRadius,
    targetRadius,
    dt * 0.25
  );

  const clampedRadius = THREE.MathUtils.clamp(
    radius,
    controls?.minDistance ?? 1.8,
    controls?.maxDistance ?? 4
  );

  // Direction interpolation
  const baseDir = slerpDir(fromDir.current, toDir.current, k);

  const desiredNDC = new THREE.Vector2(0, 0.0);

  const targetWorld = targetPointRef.current
    ? targetPointRef.current.clone()
    : baseDir.clone().multiplyScalar(1.2);

  const correctedDir = adjustDirToPlaceTargetAtNDC({
    dir: baseDir,
    camRadius: clampedRadius,
    targetWorld,
    camera: camera as THREE.PerspectiveCamera,
    desiredNDC,
  });


  const correctionAlpha = THREE.MathUtils.smoothstep(k, 0.25, 0.85);

  const finalDir = slerpDir(baseDir, correctedDir, correctionAlpha);

  camera.position.copy(finalDir.multiplyScalar(clampedRadius));
  camera.lookAt(0, 0, 0);


  if (t.current >= 1 && controls) {
    hardResetOrbitDeltas(controls);
    controls.target.set(0, 0, 0);
    controls.update();
    controls.enabled = true;
  }
});


  return (
    <group ref={groupRef}>
      <Earth isDark={isDark} />
      <CountryBorders ref={bordersGroupRef} isDark={isDark} />
      <CountryLabels isDark={isDark} />
    </group>
  );
}

/** ---------- Globe (parent) ---------- */
export default function Globe() {
  const [isDark, setIsDark] = useState(false);
  const [isRotationEnabled, setIsRotationEnabled] = useState(true);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);

  const [focus, setFocus] = useState<{ name: string; nonce: number; hitPoint?: THREE.Vector3 } | null>(
    null
  );

  const [imageCache, setImageCache] = useState(new Map<string, string[]>());
  const [preloadedImages, setPreloadedImages] = useState<string[]>([]);
  const inactivityTimer = useRef<NodeJS.Timeout | null>(null);
  const controlsRef = useRef<any>(null);
  const [createTripOpen, setCreateTripOpen] = useState(false);
  const [tripsRefreshKey, setTripsRefreshKey] = useState(0);

  // Detect dark mode changes
  useEffect(() => {
    const update = () => setIsDark(document.documentElement.classList.contains("dark"));
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  // Search bar triggers focus-country
  useEffect(() => {
    const handleFocus = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.name) return;

      const name = String(detail.name);
      setSelectedCountry(name);
      setFocus({ name, nonce: Date.now() + Math.random() });
      setIsRotationEnabled(false);
    };
    window.addEventListener("focus-country", handleFocus);
    return () => window.removeEventListener("focus-country", handleFocus);
  }, []);

  const handleUserInteractionEnd = () => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    inactivityTimer.current = setTimeout(() => {
      setIsRotationEnabled(true);
      setFocus(null);
    }, 60000);
  };

  const handleUserInteractionStart = () => {
    if (isRotationEnabled) setIsRotationEnabled(false);
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
  };

  const [panelVisible, setPanelVisible] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"info" | "social">("info");
  const [expandedPanel, setExpandedPanel] = useState<"info" | "social" | null>(null);
  const [aiExploreOpen, setAiExploreOpen] = useState(false);

  useEffect(() => {
  const openExplore = () => {
    setAiExploreOpen(true);
    setExpandedPanel("social");
    setPanelVisible(true);
    setMobilePanel("social");
  };

  window.addEventListener("open-ai-explore", openExplore);
  return () => window.removeEventListener("open-ai-explore", openExplore);
}, []);

  useEffect(() => {
    const resetGlobeForTutorial = () => {
      setAiExploreOpen(false);
      setExpandedPanel(null);
      setMobilePanel("info");
      setPanelVisible(false);
      setSelectedCountry(null);
      setFocus(null);
      setIsRotationEnabled(true);

      window.dispatchEvent(new Event("reset-globe-camera"));
    };

    const closePanelsForTutorial = () => {
      setAiExploreOpen(false);
      setExpandedPanel(null);
      setMobilePanel("info");
      setPanelVisible(false);
    };

    window.addEventListener("tutorial-reset-globe", resetGlobeForTutorial);
    window.addEventListener("tutorial-close-globe-panels", closePanelsForTutorial);

    return () => {
      window.removeEventListener("tutorial-reset-globe", resetGlobeForTutorial);
      window.removeEventListener("tutorial-close-globe-panels", closePanelsForTutorial);
    };
  }, []);

  async function preloadCountryImages(name: string) {
    if (imageCache.has(name)) {
      setPreloadedImages(imageCache.get(name)!);
      return;
    }

    try {
      const res = await fetch(`/api/countryImages?name=${encodeURIComponent(name)}`);
      const d = await res.json();
      const urls = d.urls?.length ? d.urls : ["/fallbacks/landscape.jpg", "/fallbacks/mountain.jpg"];

      imageCache.set(name, urls);
      setImageCache(new Map(imageCache));
      setPreloadedImages(urls);
    } catch {
      setPreloadedImages(["/fallbacks/landscape.jpg", "/fallbacks/mountain.jpg"]);
    }
  }

  useEffect(() => {
    if (!selectedCountry) {
      setPanelVisible(false);
      return;
    }
    preloadCountryImages(selectedCountry);
    setPanelVisible(false);
    const timer = setTimeout(() => setPanelVisible(true), 1500);
    return () => clearTimeout(timer);
  }, [selectedCountry]);

  return (
    <div className="relative flex items-center justify-center w-full h-full overflow-hidden " data-tutorial="globe">
      <Canvas
        camera={{ position: [35, 30, 4], fov: 45 }}
        gl={{ alpha: true, antialias: true }}
        performance={{ min: 0.3 }}
        onCreated={({ camera }) => {
          camera.layers.enable(0);
          camera.layers.enable(1);
        }}
      >
        <ambientLight intensity={isDark ? 8.4 : 4.5} />

        <Suspense fallback={null}>
          <RotatingGroup
            isDark={isDark}
            isRotationEnabled={isRotationEnabled}
            onCountrySelect={(name, hitPoint) => {
              // Click path uses exact hitPoint
              preloadCountryImages(name);
              setSelectedCountry(name);
              setFocus({ name, nonce: Date.now() + Math.random(), hitPoint });
              setIsRotationEnabled(false);
            }}
            focus={focus}
            controlsRef={controlsRef}
          />
        </Suspense>

        <OrbitControls
          ref={controlsRef}
          enablePan={false}
          enableZoom
          minDistance={1.8}
          maxDistance={3.5}
          zoomSpeed={0.4}
          rotateSpeed={0.3}
          onStart={handleUserInteractionStart}
          onEnd={handleUserInteractionEnd}
        />
      </Canvas>

      {panelVisible && (selectedCountry || aiExploreOpen) && (
  <>
    {/* LEFT: Social / AI panel */}
    <SocialPanel
      open={true}
      selectedCountry={selectedCountry}
      onClose={() => {
        setAiExploreOpen(false);
        setExpandedPanel(null);
        setSelectedCountry(null);
      }}
      onCreateTrip={() => setCreateTripOpen(true)}
      refreshKey={tripsRefreshKey}
      slideFrom="left"
      className={[
        "hidden lg:block left-0",
        expandedPanel === "info" ? "hidden" : "",
      ].join(" ")}
      initialViewMode={aiExploreOpen ? "ai" : "community"}
      aiIntent={aiExploreOpen ? "explore" : "country"}
      expanded={expandedPanel === "social"}
      onToggleExpanded={() =>
        setExpandedPanel((p) => (p === "social" ? null : "social"))
      }
    />

    <CreateTripModal
      open={createTripOpen}
      countryCode={selectedCountry ?? ""}
      onClose={() => setCreateTripOpen(false)}
      onCreated={() => setTripsRefreshKey((k) => k + 1)}
    />

    {/* RIGHT: Info panel (only when a country is selected) */}
    <div
      className={[
        "hidden lg:block",
        expandedPanel === "social" ? "hidden" : "",
      ].join(" ")}
    >
      <CountryInfoPanel
        key={(selectedCountry ?? "none").replace(/\s+/g, "-").toLowerCase()}
        selected={selectedCountry}
        onClose={() => {
          setExpandedPanel(null);
          setSelectedCountry(null);
        }}
        preloadedImages={preloadedImages}
        expanded={expandedPanel === "info"}
        onToggleExpanded={() =>
          setExpandedPanel((p) => (p === "info" ? null : "info"))
        }
      />
    </div>

    {/* MOBILE */}
    <div className="lg:hidden">
      {mobilePanel === "info" ? (
        <CountryInfoPanel
          key={(selectedCountry ?? "none").replace(/\s+/g, "-").toLowerCase()}
          selected={selectedCountry}
          onClose={() => {
            setAiExploreOpen(false);
            setSelectedCountry(null);
          }}
          preloadedImages={preloadedImages}
        />
      ) : (
        <SocialPanel
          open={true}
          selectedCountry={selectedCountry}
          onClose={() => {
            setAiExploreOpen(false);
            setSelectedCountry(null);
          }}
          onCreateTrip={() => setCreateTripOpen(true)}
          refreshKey={tripsRefreshKey}
          className="left-0 right-auto"
          slideFrom="left"
          initialViewMode={aiExploreOpen ? "ai" : "community"}
          aiIntent={aiExploreOpen ? "explore" : "country"}
        />
      )}

      <div
        className="fixed left-0 right-0 z-[80] lg:hidden"
        style={{ top: 0 }}
      >
          <div className="h-10 grid grid-cols-2 backdrop-blur-xl">
            <button
              type="button"
              onClick={() => setMobilePanel("social")}
              className={[
                "text-[12px] font-semibold transition-colors",
                mobilePanel === "social"
                  ? "bg-emerald-500 text-white"
                  : "text-white/70 hover:bg-white/5",
              ].join(" ")}
            >
              Social
            </button>

            <button
              type="button"
              onClick={() => setMobilePanel("info")}
              className={[
                "text-[12px] font-semibold transition-colors",
                mobilePanel === "info"
                  ? "bg-sky-500 text-white"
                  : "text-white/70 hover:bg-white/5",
              ].join(" ")}
            >
              Travel
            </button>
          </div>
        </div>
      </div>
  </>
)}

    </div>
  );
}
