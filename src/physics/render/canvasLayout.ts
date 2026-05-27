/** 物理刺激 Canvas 逻辑尺寸（与 CSS aspect-ratio、插件内 width/height 一致） */
export const PHYSICS_CANVAS_LOGICAL_W = 1000;
export const PHYSICS_CANVAS_LOGICAL_H = 650;

/** 遮挡阶段整屏填充色（明显区别于显示阶段的浅灰底） */
export const PHYSICS_HIDDEN_FILL = "#1e293b";

/** 开发者模式：半透明遮挡，可透视下层仍在运动的刺激 */
export const PHYSICS_OCCLUSION_FILL_DEVELOPER = "rgba(30, 41, 59, 0.45)";
