"use client"

import { useState } from "react"
import { MeshGradient, DotOrbit } from "@paper-design/shaders-react"

export default function ShaderBackground({ 
  children, 
  effect = "mesh", 
  speed = 1.0,
  intensity = 1.5,
  colors = ["#000000", "#1a1a1a", "#333333", "#f59e0b"]
}) {
  return (
    <div className="w-full h-full relative overflow-hidden">
      {effect === "mesh" && (
        <MeshGradient
          className="w-full h-full absolute inset-0"
          colors={colors}
          speed={speed}
          backgroundColor="#000000"
        />
      )}

      {effect === "dots" && (
        <div className="w-full h-full absolute inset-0 bg-black">
          <DotOrbit
            className="w-full h-full"
            dotColor="#333333"
            orbitColor="#1a1a1a"
            speed={speed}
            intensity={intensity}
          />
        </div>
      )}

      {effect === "combined" && (
        <>
          <MeshGradient
            className="w-full h-full absolute inset-0"
            colors={colors}
            speed={speed * 0.5}
            wireframe="true"
            backgroundColor="#000000"
          />
          <div className="w-full h-full absolute inset-0 opacity-60">
            <DotOrbit
              className="w-full h-full"
              dotColor="#333333"
              orbitColor="#1a1a1a"
              speed={speed * 1.5}
              intensity={intensity * 0.8}
            />
          </div>
        </>
      )}

      {/* Lighting overlay effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-1/4 left-1/3 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: `${3 / speed}s` }}
        />
        <div
          className="absolute bottom-1/3 right-1/4 w-24 h-24 bg-yellow-500/5 rounded-full blur-2xl animate-pulse"
          style={{ animationDuration: `${2 / speed}s`, animationDelay: "1s" }}
        />
        <div
          className="absolute top-1/2 right-1/3 w-20 h-20 bg-amber-400/5 rounded-full blur-xl animate-pulse"
          style={{ animationDuration: `${4 / speed}s`, animationDelay: "0.5s" }}
        />
      </div>

      {/* Content overlay */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  )
}

export { ShaderBackground }
