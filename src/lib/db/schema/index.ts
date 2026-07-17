/**
 * Full entity catalog (ARCHITECTURE.md §3). The Foundation slice ships all
 * tables; later slices fill them in rather than reshape them.
 */
export * from "./auth";
export * from "./org";
export * from "./customers";
export * from "./contacts";
export * from "./products";
export * from "./documents";
export * from "./payments";
export * from "./audit";
export * from "./comms";
export * from "./comments";
export * from "./billing";
export * from "./ai";
