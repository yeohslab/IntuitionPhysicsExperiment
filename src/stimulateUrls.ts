/** 五份预生成刺激集（与仓库根目录 `stimulate/` 下 JSON 同源，构建时由 Vite 解析为资源 URL） */
import u1 from "../stimulate/stimulus-01.json?url";
import u2 from "../stimulate/stimulus-02.json?url";
import u3 from "../stimulate/stimulus-03.json?url";
import u4 from "../stimulate/stimulus-04.json?url";
import u5 from "../stimulate/stimulus-05.json?url";

export const STIMULUS_JSON_URLS: readonly string[] = [u1, u2, u3, u4, u5];
