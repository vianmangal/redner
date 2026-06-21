"use client";

// Adapted from the React Bits Silk component: https://reactbits.dev/backgrounds/silk

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import {
  Color,
  type IUniform,
  type Mesh,
  type PlaneGeometry,
  type ShaderMaterial,
} from "three";

interface SilkProps {
  speed?: number;
  scale?: number;
  color?: string;
  noiseIntensity?: number;
  rotation?: number;
}

type SilkUniforms = Record<string, IUniform> & {
  uTime: IUniform<number>;
  uColor: IUniform<Color>;
  uSpeed: IUniform<number>;
  uScale: IUniform<number>;
  uRotation: IUniform<number>;
  uNoiseIntensity: IUniform<number>;
};

const vertexShader = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
varying vec2 vUv;

uniform float uTime;
uniform vec3 uColor;
uniform float uSpeed;
uniform float uScale;
uniform float uRotation;
uniform float uNoiseIntensity;

const float e = 2.71828182845904523536;

float noise(vec2 texCoord) {
  float G = e;
  vec2 r = G * sin(G * texCoord);
  return fract(r.x * r.y * (1.0 + texCoord.x));
}

vec2 rotateUvs(vec2 uv, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  mat2 rotation = mat2(c, -s, s, c);
  return rotation * uv;
}

void main() {
  float randomValue = noise(gl_FragCoord.xy);
  vec2 uv = rotateUvs(vUv * uScale, uRotation);
  vec2 texturePosition = uv * uScale;
  float timeOffset = uSpeed * uTime;

  texturePosition.y += 0.03 * sin(8.0 * texturePosition.x - timeOffset);

  float pattern = 0.6 +
    0.4 * sin(5.0 * (
      texturePosition.x + texturePosition.y +
      cos(3.0 * texturePosition.x + 5.0 * texturePosition.y) +
      0.02 * timeOffset
    ) + sin(20.0 * (
      texturePosition.x + texturePosition.y - 0.1 * timeOffset
    )));

  vec4 color = vec4(uColor, 1.0) * vec4(pattern) -
    randomValue / 15.0 * uNoiseIntensity;
  color.a = 1.0;
  gl_FragColor = color;
}
`;

function SilkPlane({ uniforms }: { uniforms: SilkUniforms }) {
  const mesh = useRef<Mesh<PlaneGeometry, ShaderMaterial>>(null);
  const { viewport } = useThree();

  useLayoutEffect(() => {
    mesh.current?.scale.set(viewport.width, viewport.height, 1);
  }, [viewport]);

  useFrame((_, delta) => {
    uniforms.uTime.value += 0.1 * delta;
  });

  return (
    <mesh ref={mesh}>
      <planeGeometry args={[1, 1, 1, 1]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
      />
    </mesh>
  );
}

export default function Silk({
  speed = 5,
  scale = 1,
  color = "#7b7481",
  noiseIntensity = 1.5,
  rotation = 0,
}: SilkProps) {
  const uniforms = useMemo<SilkUniforms>(
    () => ({
      uTime: { value: 0 },
      uColor: { value: new Color(color) },
      uSpeed: { value: speed },
      uScale: { value: scale },
      uRotation: { value: rotation },
      uNoiseIntensity: { value: noiseIntensity },
    }),
    [color, noiseIntensity, rotation, scale, speed],
  );

  return (
    <Canvas dpr={[1, 1.5]} frameloop="always">
      <SilkPlane uniforms={uniforms} />
    </Canvas>
  );
}
