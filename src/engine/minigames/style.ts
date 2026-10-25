// Shared minigame styles. The host injects them once (e.g. via a <style> tag).
/** The shared styles of the minigames, injected once by the host. @public */
export const MINIGAME_CSS = `
.mg{position:absolute;inset:0;overflow:hidden;user-select:none;-webkit-user-select:none;touch-action:none;font-family:var(--font-ui,'Galmuri11'),monospace;color:#fff}
.mg-img{position:absolute;pointer-events:none;transform-origin:50% 100%}
.mg-skip{position:absolute;right:2%;top:3%;z-index:995;border:2px solid #fff;background:rgba(0,0,0,.6);color:#fff;border-radius:6px;font:inherit;padding:.2em .6em;cursor:pointer}
.mg-tile{position:relative;padding:0;border:0;border-radius:4px;cursor:pointer;background-size:cover;background-position:center}
.mg-tile img{width:100%;height:100%;display:block;transition:transform .15s;pointer-events:none}
.mg-hl{box-shadow:0 0 0 3px #ffd84d,0 0 18px #ffd84d;animation:mg-blink .8s steps(2) infinite}
@keyframes mg-blink{50%{box-shadow:0 0 0 3px #7a5a00,0 0 4px #7a5a00}}
.mg-opt{position:relative;border:3px solid #2c4a7a;background:rgba(10,14,30,.75);border-radius:12px;cursor:pointer;padding:4%;display:flex;align-items:center;justify-content:center}
.mg-opt img{max-width:100%;max-height:100%;pointer-events:none}
.mg-opt:hover,.mg-opt:focus-visible{border-color:#ffd84d}
.mg-shake{animation:mg-shake .35s linear}
@keyframes mg-shake{20%{transform:translateX(-6px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}
.mg-pop{animation:mg-pop .5s ease-out}
@keyframes mg-pop{50%{transform:scale(1.15)}}
.mg-zone{position:absolute;left:0;right:0;height:50%;display:flex;justify-content:center;padding:2% 3%;color:#fff;text-shadow:2px 2px 0 #000;z-index:200;cursor:pointer;font-family:var(--font-pixel,'Press Start 2P'),monospace}
.mg-bar{position:absolute;left:3%;top:4%;width:30%;height:2.4%;background:rgba(0,0,0,.5);border:2px solid #fff;border-radius:4px;z-index:210;overflow:hidden}
.mg-bar>div{height:100%;width:0;background:#ffd84d}
.mg-gauge{position:absolute;left:50%;bottom:6%;transform:translateX(-50%);width:50%;height:4%;background:rgba(0,0,0,.55);border:2px solid #fff;border-radius:8px;overflow:hidden;z-index:210}
.mg-gauge>div{height:100%;width:0;background:linear-gradient(90deg,#ff9fd0,#ffd84d);transition:width .1s}
.mg-spin{animation:mg-spin 1.2s linear infinite;transform-origin:50% 50%!important}
@keyframes mg-spin{to{transform:rotate(-360deg)}}
.mg-toast{position:absolute;left:50%;top:14%;transform:translateX(-50%);background:rgba(20,12,30,.9);border:2px solid #ffd84d;color:#ffd84d;padding:.3em .8em;border-radius:6px;z-index:999;pointer-events:none;white-space:nowrap}
@media (prefers-reduced-motion:reduce){.mg *{animation-duration:.01s!important;animation-iteration-count:1!important}}
`;
