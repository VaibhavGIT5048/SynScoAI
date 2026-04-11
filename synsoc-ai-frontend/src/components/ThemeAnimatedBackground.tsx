import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import * as THREE from 'three';

interface ThemeAnimatedBackgroundProps {
  className?: string;
}

export default function ThemeAnimatedBackground({ className = '' }: ThemeAnimatedBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 100);
    camera.position.z = 14;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const geometry = new THREE.BufferGeometry();
    const pointsCount = 520;
    const positions = new Float32Array(pointsCount * 3);

    for (let i = 0; i < pointsCount; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * 34;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 24;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 20;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0x00ff88,
      size: 0.055,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(5.3, 0.012, 12, 160),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color('#00ff88'),
        transparent: true,
        opacity: 0.12,
      })
    );
    ring.rotation.x = Math.PI * 0.42;
    ring.rotation.y = Math.PI * 0.2;
    scene.add(ring);

    const resize = () => {
      const parent = canvas.parentElement;
      const width = parent?.clientWidth ?? window.innerWidth;
      const height = parent?.clientHeight ?? window.innerHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    };

    resize();
    window.addEventListener('resize', resize);

    let raf = 0;
    let tick = 0;

    const animate = () => {
      tick += 0.0035;
      points.rotation.y = tick;
      points.rotation.x = Math.sin(tick * 1.7) * 0.12;
      ring.rotation.z += 0.0015;
      ring.rotation.y -= 0.001;
      renderer.render(scene, camera);
      raf = window.requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      ring.geometry.dispose();
      (ring.material as THREE.Material).dispose();
    };
  }, []);

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`.trim()}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      <motion.div
        className="absolute -left-36 top-[-12rem] h-[28rem] w-[28rem] rounded-full"
        animate={{ opacity: [0.12, 0.22, 0.12], scale: [1, 1.06, 1] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        style={{ background: 'radial-gradient(circle, hsl(var(--primary) / 0.18), transparent 64%)' }}
      />

      <motion.div
        className="absolute -right-28 bottom-[-11rem] h-[24rem] w-[24rem] rounded-full"
        animate={{ opacity: [0.1, 0.2, 0.1], scale: [1.02, 0.96, 1.02] }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
        style={{ background: 'radial-gradient(circle, hsl(var(--primary) / 0.14), transparent 70%)' }}
      />

      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 22%, rgba(4, 4, 4, 0.9) 84%), linear-gradient(to bottom, rgba(0, 0, 0, 0.32), rgba(0, 0, 0, 0.74))',
        }}
      />
    </div>
  );
}
