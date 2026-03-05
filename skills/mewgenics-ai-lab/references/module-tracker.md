# Mewgenics Module Tracker

Last updated: 2026-03-02
Owner: Codex + user
Scope: Breeding reverse-engineering, AI decision layer preparation, and game automation execution path.

## Table of Contents
- 1. Background
- 2. Current Baseline Report
- 3. Workspace and Artifact Map
- 4. Confirmed Findings
- 5. Implemented Mod State
- 6. Open Questions and Risks
- 7. Milestone Plan
- 8. Session Log

## 1. Background
The current module work aims to reduce grind in Mewgenics while building a foundation for AI-driven gameplay.

Immediate target:
- Understand breeding mechanics well enough to model optimization (MCTS/engineering solver).

Next targets:
- Capture realtime in-game state reliably.
- Build decision logic over that state.
- Execute in-game actions (for example: click next day, click poop, interact with cats) to affect actual gameplay loops.

## 2. Current Baseline Report
Status snapshot:
- Breeding core has moved from black-box assumptions to code-backed formulas.
- Inbreeding (COI) penalty thresholds for birth defects are now known (external RE evidence).
- COI can now be computed from the save by parsing `files.pedigree` (best-effort heuristic scan) and applying standard pedigree COI math; what remains open is whether COI also feeds the allow/reject compatibility equation (beyond birth defects).
- Key inheritance and fertility branches have executable-level evidence.
- Stimulation-based inheritance odds for “better stat” and spell/passive pass-through are now known (external RE evidence; see **4.36**).
- A mod bundle for reduced grind exists, including a Tracy shop free food entry and a Jack shop free furniture entry patch.
- Runtime data capture (savefile read + cattery export) is stable and reusable.
- A no-click data-only pipeline runner exists (optional corpse gift -> export -> strategy -> rehome plan/apply -> optional poop clean):
  - `tools/runtime/run_strategy_pipeline.py`
- A one-click housekeeping entrypoint exists (for non-technical use; run with the game closed):
  - `mod/一键整合包-v1.1/一键整理.bat` (corpse gift + export + strategy + room rehome + poop clean; defaults to role-based room repartition).
- The breeding-first strategy loop is now more actionable:
  - strategy output includes an "after rehome + poop clean" estimate (`switch_est`) so you can see whether you're ready to switch phases before applying changes.
  - `run_strategy_pipeline.py` prints phase + top breeding suggestions and a one-liner `--apply-*` command.
- A minimal-click autoplay runner exists for "take inside + next day" loops:
  - `tools/runtime/run_house_autoplay.py`
- House End Day polling can now click extra modal/choice buttons (e.g. corpse collector prompts) to avoid the autoplay loop getting stuck:
  - `tools/runtime/house_actions.py advance-day --extra-continue-point <point_name>`
- Full-cattery base stat extraction is now direct (no cat-by-cat UI switching):
  - `cats.data` decoded via LZ4
  - per-cat `base_stats` available for all 241 cats in current save
- Hidden sexuality/libido/aggression + lover/hater relationship fields are now decoded from `cats.data` and exported:
  - `tools/runtime/watch_save_state.py` (`decode_cat_record`)
  - `tools/runtime/export_cattery_data.py`
- Pair attraction scalar used for the breeding rejection gate can now be computed offline (directed + mutual):
  - `tools/runtime/breeding_compat.py`
  - `tools/runtime/report_breeding_compat.py`
- Fertility (`+0xbf0`) is now decoded from `cats.data` and used to estimate kitten/twins odds offline:
  - `tools/runtime/watch_save_state.py` (decode/export `fertility`)
  - `tools/runtime/breeding_compat.py` (`litter_probabilities`)
  - `tools/runtime/report_breeding_compat.py` (prints `p>=1` / `expected`)
- In this current execution environment, direct cursor injection is not available, so click automation results are not yet trustworthy.
- An in-process SDL event injection backend (Frida) is now implemented to bypass Win32 cursor injection:
  - `tools/runtime/house_actions.py --backend sdl` (needs in-game verification to mark house actions as authoritative).
- A native End Day / Next Day trigger backend (Frida) is now implemented to avoid coordinate clicks for the primary day-advance action:
  - `tools/runtime/house_actions.py advance-day --backend native` (still needs in-game verification to mark as authoritative).
- SDL injection is confirmed to be consumed by the game's SDL event loop (SDL_PollEvent returns our injected mouse events):
  - `.tmp_data/sdl_pollprobe_latest.json`
- SDL click injection is DPI-sensitive:
  - Win32 `GetWindowRect` can be DPI-virtualized (controller process is DPI-unaware) and must not be used as the SDL coordinate base.
  - Current implementation now defaults to SDL window pixel sizes for injected coords (and logs Win32 vs SDL sizes for evidence).
- Point calibration drift is the current likely root cause for house MVP failing:
  - `tools/runtime/ui_points.json` must match the actual house UI layout.
  - Added `tools/runtime/record_house_mvp_points.py --backend sdl` to re-record points via SDL events (no cursor math).
- A save-write execution path exists to reduce "move cats" clicking:
  - rewrite `files.house_state` to re-home the active roster between rooms (in-game effect still needs validation).
  - `rehome_house_rooms.py` policies:
    - default: keep per-room cat counts (safe; subtle changes)
    - `--repartition`: cap breeder rooms (default 4) and push overflow to combat/other rooms (matches "auto classify cats" expectation).
- A save-write poop cleanup path exists to reduce house clutter without UI clicking:
  - delete `furniture` rows whose object name is `poop` (default: exclude combat rooms from `strategy_settings.json`).
- Room effects (Comfort/Stimulation/etc) can now be computed from the save (furniture placement + `furniture_effects.gon`), and room roles can be auto-inferred from that signal for cross-save robustness.
- Strategy output is now closer to “hidden mechanics” by default:
  - the all-7 planner can derive per-stat “inherit better parent” probability from the breeder-main room `Stimulation` (external RE evidence; see **4.36**),
  - room-role inference prefers explicit fight signals + breeding suppression (from room effects), and exports an RE-backed breeding-room comfort/crowding multiplier (plus a BreedSuppression hard gate; see **4.39**).
- All-7 search can now be time-aware (shortest-days/steps):
  - configurable via `strategy.all7_objective` + `strategy.all7_target` in `tools/runtime/strategy_settings.json`,
  - MCTS output includes per-step progress and `steps_to_best/steps_to_target` to estimate shortest time-to-goal.
- Save snapshots + diffs are now supported to accelerate decoding of unknown cat fields:
  - snapshot "before/after" and diff to learn what changed for day-advance / cat handoff events.
  - interactive capture wizard:
    - `mod/test/capture_save_deltas.bat` (day-advance + NPC gift stages; writes `mod/test/logs/<timestamp>/`)
- `files.npc_progress` is now partially parsed/diffed (key-level), enabling a repeatable save-write “gift cat” recipe workflow:
  - `tools/runtime/diff_npc_progress.py`
  - `tools/runtime/learn_gift_recipe.py` -> `tools/runtime/apply_gift_recipe.py`
- Local All-7 planning UI now consumes decoded `base_stats` directly, with optional manual override.

## 3. Workspace and Artifact Map
Primary game workspace:
- `f:\SteamLibrary\steamapps\common\Mewgenics`

Main mod workspace:
- `f:\SteamLibrary\steamapps\common\Mewgenics\mod\一键整合包-v1.1`

Reverse-engineering artifacts:
- `f:\SteamLibrary\steamapps\common\Mewgenics\mod\一键整合包-v1.1\.tmp_data\breeding_mechanics_extracted_v3.md`
- `f:\SteamLibrary\steamapps\common\Mewgenics\mod\一键整合包-v1.1\.tmp_data\fcn_1401e47e0_clean.txt`
- `f:\SteamLibrary\steamapps\common\Mewgenics\mod\一键整合包-v1.1\.tmp_data\fcn_1400a5ba0_clean.txt`
- `f:\SteamLibrary\steamapps\common\Mewgenics\mod\一键整合包-v1.1\.tmp_data\fcn_1400a4920_clean.txt`
- `f:\SteamLibrary\steamapps\common\Mewgenics\mod\一键整合包-v1.1\.tmp_data\fcn_1401b0420_clean.txt`
- `f:\SteamLibrary\steamapps\common\Mewgenics\mod\一键整合包-v1.1\.tmp_data\fcn_1400dec80_clean.txt`
- `f:\SteamLibrary\steamapps\common\Mewgenics\mod\一键整合包-v1.1\.tmp_data\input_wndproc_rawinput_rz_20260225.txt`
- `f:\SteamLibrary\steamapps\common\Mewgenics\mod\一键整合包-v1.1\.tmp_data\input_pipeline_rz_extract_20260225_v2.txt`
- `f:\SteamLibrary\steamapps\common\Mewgenics\mod\一键整合包-v1.1\.tmp_data\input_pipeline_rz_helpers_20260225.txt`
- `f:\SteamLibrary\steamapps\common\Mewgenics\mod\一键整合包-v1.1\.tmp_data\input_dispatcher_bafc20_rz_20260225.txt`
- `f:\SteamLibrary\steamapps\common\Mewgenics\mod\一键整合包-v1.1\.tmp_data\input_dispatcher_bafad0_rz_20260225.txt`
- `f:\SteamLibrary\steamapps\common\Mewgenics\mod\一键整合包-v1.1\.tmp_data\input_dispatcher_baf8e0_rz_20260225.txt`
- `f:\SteamLibrary\steamapps\common\Mewgenics\mod\一键整合包-v1.1\.tmp_data\input_dispatcher_badcb0_rz_20260225.txt`
- `f:\SteamLibrary\steamapps\common\Mewgenics\mod\一键整合包-v1.1\.tmp_data\input_event_queue_globals_xrefs_20260225.txt`
- `f:\SteamLibrary\steamapps\common\Mewgenics\mod\一键整合包-v1.1\.tmp_data\input_event_queue_axt_20260225.txt`
- `f:\SteamLibrary\steamapps\common\Mewgenics\mod\一键整合包-v1.1\.tmp_data\input_event_queue_candidates_pdf_20260225.txt`
- `f:\SteamLibrary\steamapps\common\Mewgenics\mod\一键整合包-v1.1\.tmp_data\input_event_pump_c29360_rz_20260225.txt`
- `f:\SteamLibrary\steamapps\common\Mewgenics\mod\一键整合包-v1.1\.tmp_data\input_event_queue_pop_probe_20260225.txt`
- `f:\SteamLibrary\steamapps\common\Mewgenics\mod\一键整合包-v1.1\.tmp_data\sdl_dynapi_stub_addrs_rz_20260225.txt`
- `f:\SteamLibrary\steamapps\common\Mewgenics\mod\一键整合包-v1.1\.tmp_data\endday_fns_rz_20260226_123458.txt`
- `f:\SteamLibrary\steamapps\common\Mewgenics\mod\一键整合包-v1.1\.tmp_data\passday_callers_fns_rz_20260226_125211.txt`
- `f:\SteamLibrary\steamapps\common\Mewgenics\mod\一键整合包-v1.1\.tmp_data\passday_pd_nocolor_rz_20260226_131140.txt`
- `f:\SteamLibrary\steamapps\common\Mewgenics\mod\一键整合包-v1.1\.tmp_data\interstitial_virtuals_pd_rz_20260226_134304.txt`

Tooling:
- Portable rizin: `f:\SteamLibrary\steamapps\common\Mewgenics\_tools\rizin\rizin-win-installer-vs2019_static-64\bin\rizin.exe`

## 4. Confirmed Findings
### 4.1 Base stats set (Confirmed)
- Seven base stats:
  - `strength`
  - `dexterity`
  - `constitution`
  - `intelligence`
  - `speed`
  - `charisma`
  - `luck`
- Evidence:
  - `f:\SteamLibrary\steamapps\common\Mewgenics\mod\模组加载器v1.2\_internal\base_data\data\characters\player_cat.gon:12`
  - `f:\SteamLibrary\steamapps\common\Mewgenics\mod\模组加载器v1.2\_internal\base_data\data\characters\player_cat.gon:13`
  - `f:\SteamLibrary\steamapps\common\Mewgenics\mod\模组加载器v1.2\_internal\base_data\data\characters\player_cat.gon:14`
  - `f:\SteamLibrary\steamapps\common\Mewgenics\mod\模组加载器v1.2\_internal\base_data\data\characters\player_cat.gon:15`
  - `f:\SteamLibrary\steamapps\common\Mewgenics\mod\模组加载器v1.2\_internal\base_data\data\characters\player_cat.gon:16`
  - `f:\SteamLibrary\steamapps\common\Mewgenics\mod\模组加载器v1.2\_internal\base_data\data\characters\player_cat.gon:17`
  - `f:\SteamLibrary\steamapps\common\Mewgenics\mod\模组加载器v1.2\_internal\base_data\data\characters\player_cat.gon:18`

### 4.2 Breeding uses base stats (Confirmed)
- Evidence from game dialog and unlock structure:
  - `f:\SteamLibrary\steamapps\common\Mewgenics\贴吧汉化\data\text\npc_dialog.csv:5390`
  - `f:\SteamLibrary\steamapps\common\Mewgenics\贴吧汉化\data\text\npc_dialog.csv:5391`
  - `f:\SteamLibrary\steamapps\common\Mewgenics\mod\模组加载器v1.2\_internal\base_data\data\npc_favor_unlocks.gon:214`

### 4.3 Comfort/Stimulation relevance (Confirmed)
- Low comfort can prevent breeding:
  - `f:\SteamLibrary\steamapps\common\Mewgenics\贴吧汉化\data\text\npc_dialog.csv:5346`
- High stimulation supports inheritance:
  - `f:\SteamLibrary\steamapps\common\Mewgenics\贴吧汉化\data\text\npc_dialog.csv:5356`
- External RE (SciresM) notes confirm room conditions participate in the breeding gate:
  - cats can reject based on attraction criteria, number of other cats in the room, and overall room comfort; some furniture affects comfort/stimulation.
  - Evidence: `https://gist.github.com/SciresM/95a9dbba22937420e75d4da617af1397`

### 4.4 Fertility and result branching (Confirmed)
- Fertility roll core uses product of parent values at offset `+0xbf0`:
  - `p = parentA[+0xbf0] * parentB[+0xbf0]`
  - `n = Bernoulli(p) + (p > 1 && Bernoulli(p - 1) ? 1 : 0)`
- Same-sex suppression forces `n = 0` when sex codes match and are not neutral (2).
- Implemented (data-only, save-side):
  - decode `fertility` from the cats blob (inferred mapping to `+0xbf0`)
  - model litter distribution `{p0,p1,p2,expected}` for pair analysis
- Evidence:
  - `.tmp_data/fcn_1401e47e0_clean.txt:1699`
  - `.tmp_data/fcn_1401e47e0_clean.txt:1700`
  - `.tmp_data/fcn_1401e47e0_clean.txt:1705`
  - `.tmp_data/fcn_1401e47e0_clean.txt:1715`
  - `.tmp_data/fcn_1401e47e0_clean.txt:1717`
  - `.tmp_data/fcn_1401e47e0_clean.txt:1722`
  - `mod/一键整合包-v1.1/tools/runtime/watch_save_state.py:429`
  - `mod/一键整合包-v1.1/tools/runtime/breeding_compat.py:158`
  - `mod/一键整合包-v1.1/tools/runtime/report_breeding_compat.py:129`
- Branch outputs include kitten/twins/none:
  - `.tmp_data/fcn_1401e47e0_clean.txt:1850`
  - `.tmp_data/fcn_1401e47e0_clean.txt:2010`
  - `.tmp_data/fcn_1401e47e0_clean.txt:2050`

### 4.5 Pair rejection branches exist (Confirmed)
- Rejection text routes:
  - `.tmp_data/fcn_1401e47e0_clean.txt:2332` (`boyRejectGirl`)
  - `.tmp_data/fcn_1401e47e0_clean.txt:2342` (`girlRejectBoy`)
- Same-code gate path also present:
  - `.tmp_data/fcn_1401e47e0_clean.txt:1723`

### 4.6 Single-stat inheritance formula (Confirmed)
- Core chooser function: `fcn.1400a4920`.
- For each stat, choose one parent's stat via weighted probability:
  - If A > B, add best-bias bonus to A weight.
  - If A < B, add best-bias bonus to B weight.
  - Choose A with `wA / (wA + wB)`, else choose B.
- Evidence:
  - `.tmp_data/fcn_1400a4920_clean.txt:23`
  - `.tmp_data/fcn_1400a4920_clean.txt:25`
  - `.tmp_data/fcn_1400a4920_clean.txt:28`
  - `.tmp_data/fcn_1400a4920_clean.txt:66`
  - `.tmp_data/fcn_1400a4920_clean.txt:68`
  - `.tmp_data/fcn_1400a4920_clean.txt:70`

### 4.7 Seven stat writes per kitten (Confirmed)
- Inheritance routine calls the stat chooser 7 times with offsets from `+0x6f0` to `+0x708`.
- Evidence:
  - `.tmp_data/fcn_1400a5ba0_clean.txt:309`
  - `.tmp_data/fcn_1400a5ba0_clean.txt:315`
  - `.tmp_data/fcn_1400a5ba0_clean.txt:343`
  - `.tmp_data/fcn_1400a5ba0_clean.txt:357`

### 4.8 Inheritance multipliers (Confirmed)
- Resolver function: `fcn.1401b0420`.
- Confirmed constants (double):
  - `0.25` (`0x141131320`) for stat-favor mom/dad paths.
  - `0.10` (`0x1411312b0`) for best/stat boost path.
  - `0.01` (`0x1411311d0`) as stimulation cross-term on relevant paths.
- Evidence:
  - `.tmp_data/fcn_1401b0420_clean.txt:183`
  - `.tmp_data/fcn_1401b0420_clean.txt:215`
  - `.tmp_data/fcn_1401b0420_clean.txt:230`

### 4.9 Stage-1 save entry verifier works (Confirmed)
- Entry pipeline verifies transition out of home menu before claiming success.
- Recent run succeeded with keyboard strategy and produced full save snapshot.
- Evidence:
  - `mod/一键整合包-v1.1/tools/runtime/run_cattery_pipeline.py:174`
  - `mod/一键整合包-v1.1/tools/runtime/run_cattery_pipeline.py:324`
  - `mod/一键整合包-v1.1/tools/runtime/run_cattery_pipeline.py:518`
  - `mod/一键整合包-v1.1/.tmp_data/cattery_stage1_kb3.json:8`
  - `mod/一键整合包-v1.1/.tmp_data/cattery_stage1_kb3.json:9`
  - `mod/一键整合包-v1.1/.tmp_data/cattery_stage1_kb3.json:10`

### 4.10 House action runtime reached click-and-verify phase (Confirmed)
- `house_actions.py` is not click-only; it verifies by save and state deltas.
- `take_inside` validator checks movement/room deltas and empty-room changes.
- `advance_day` validator checks `current_day` increment and tracks save fingerprint change.
- Evidence:
  - `mod/一键整合包-v1.1/tools/runtime/house_actions.py:5`
  - `mod/一键整合包-v1.1/tools/runtime/house_actions.py:6`
  - `mod/一键整合包-v1.1/tools/runtime/house_actions.py:243`
  - `mod/一键整合包-v1.1/tools/runtime/house_actions.py:295`

### 4.11 Latest house action verification is failing (Confirmed)
- Latest `take_inside` run returned `success=false`; no moved cats, no room changes, no save fingerprint change.
- Latest `advance_day` run returned `success=false`; `delta_day=0` and save fingerprint unchanged despite repeated continue-click attempts.
- Evidence:
  - `mod/一键整合包-v1.1/.tmp_data/house_take_inside_latest.json:4`
  - `mod/一键整合包-v1.1/.tmp_data/house_take_inside_latest.json:114`
  - `mod/一键整合包-v1.1/.tmp_data/house_take_inside_latest.json:115`
  - `mod/一键整合包-v1.1/.tmp_data/house_take_inside_latest.json:117`
  - `mod/一键整合包-v1.1/.tmp_data/house_advance_day_latest.json:4`
  - `mod/一键整合包-v1.1/.tmp_data/house_advance_day_latest.json:26`
  - `mod/一键整合包-v1.1/.tmp_data/house_advance_day_latest.json:27`

### 4.12 Cursor injection unavailable in current run environment (Confirmed)
- Probe shows `SetCursorPos` fails and cursor coordinates do not change after `SendInput` move events.
- Because cursor movement is unavailable, click verification can produce false negatives/false positives unless guarded.
- Evidence:
  - `mod/一键整合包-v1.1/.tmp_data/input_injection_probe_latest.json:21`
  - `mod/一键整合包-v1.1/.tmp_data/input_injection_probe_latest.json:26`
  - `mod/一键整合包-v1.1/.tmp_data/input_injection_probe_latest.json:27`
  - `mod/一键整合包-v1.1/tools/runtime/ui_automation.py:337`
  - `mod/一键整合包-v1.1/tools/runtime/ui_automation.py:374`

### 4.13 All-7 manual planner UI is implemented (Confirmed)
- Added a local desktop UI to:
  - load `cattery_data_latest.json`,
  - manually enter 7 base stats per cat,
  - rank male/female pairs by expected all-7 balance.
- Manual stat state persists to `.tmp_data/all7_manual_stats.json`.
- Evidence:
  - `mod/一键整合包-v1.1/tools/runtime/all7_planner_ui.py:20`
  - `mod/一键整合包-v1.1/tools/runtime/all7_planner_ui.py:64`
  - `mod/一键整合包-v1.1/tools/runtime/all7_planner_ui.py:309`
  - `mod/一键整合包-v1.1/tools/runtime/README_DATA.md:34`

### 4.14 Full cat-state base stats can be read directly from save (Confirmed)
- `cats.data` blobs are LZ4-compressed and can be decoded to full cat payloads.
- Decoded payload yields:
  - `name_guess`
  - `sex_guess`
  - `level_guess`
  - `base_stats` (`strength..luck`)
- Current save export shows `241/241` cats with decoded `base_stats`.
- Evidence:
  - `mod/一键整合包-v1.1/tools/runtime/watch_save_state.py:296`
  - `mod/一键整合包-v1.1/tools/runtime/watch_save_state.py:378`
  - `mod/一键整合包-v1.1/tools/runtime/export_cattery_data.py:74`
  - `mod/一键整合包-v1.1/.tmp_data/cattery_data_latest.json:14`
  - `mod/一键整合包-v1.1/.tmp_data/cattery_data_latest.json:438`
  - `mod/一键整合包-v1.1/.tmp_data/cattery_data_latest.json:452`

### 4.15 Strategy snapshot pipeline now supports room grouping + pair ranking (Confirmed)
- Added strategy builder that consumes decoded cattery snapshot and settings:
  - room role grouping (`breeder_main` / `breeder_secondary` / `combat` / `unknown`)
  - pair ranking output for all-7 objective
  - day-control suggestion (`manual` vs `until_food_limit`)
- Evidence:
  - `mod/一键整合包-v1.1/tools/runtime/build_cattery_strategy.py:1`
  - `mod/一键整合包-v1.1/tools/runtime/strategy_settings.json:1`
  - `mod/一键整合包-v1.1/.tmp_data/cattery_strategy_latest.json`

### 4.16 MCTS depth-5 branch search is active (Confirmed)
- Strategy layer now supports MCTS search with configurable depth/simulations.
- Current default settings use:
  - `mcts_depth = 5`
  - `mcts_simulations = 800`
- Latest strategy output includes a non-empty best branch with 5 steps and terminal best-branch score.
- Evidence:
  - `mod/一键整合包-v1.1/tools/runtime/build_cattery_strategy.py`
  - `mod/一键整合包-v1.1/tools/runtime/strategy_settings.json`
  - `mod/一键整合包-v1.1/.tmp_data/cattery_strategy_latest.json`

### 4.17 Raw Input message handler exists (Confirmed)
- The game has a raw-input message handler that explicitly branches on:
  - `WM_INPUT_DEVICE_CHANGE` (`0x00FE` / `254`)
  - `WM_INPUT` (`0x00FF` / `255`)
- The `WM_INPUT` path calls `GetRawInputData` with:
  - `uiCommand = 0x10000003` (RID_INPUT)
  - `cbSizeHeader = 0x18` (RAWINPUTHEADER size on x64)
  - then dispatches to `fcn.140c63f60` for decoding / state update.
- The `WM_INPUT_DEVICE_CHANGE` path branches on `wParam` and calls:
  - `fcn.140c63680` when `wParam == 1` (arrival: queries device info via `GetRawInputDeviceInfoA`)
  - `fcn.140c63a70` when `wParam == 2` (removal: unlink + cleanup)
- Evidence:
  - `mod/一键整合包-v1.1/.tmp_data/input_wndproc_rawinput_rz_20260225.txt:19`
  - `mod/一键整合包-v1.1/.tmp_data/input_wndproc_rawinput_rz_20260225.txt:45`
  - `mod/一键整合包-v1.1/.tmp_data/input_wndproc_rawinput_rz_20260225.txt:57`
  - `mod/一键整合包-v1.1/.tmp_data/input_wndproc_rawinput_rz_20260225.txt:72`
  - `mod/一键整合包-v1.1/.tmp_data/input_wndproc_rawinput_rz_20260225.txt:78`

### 4.18 Input-state update helpers identified (Confirmed, partial semantics)
- `fcn.140c63f60` (raw input decode/dispatch) calls helper routines that appear to:
  - update per-button state (`fcn.140bcc230`, `fcn.140bcc3b0`)
  - update per-axis / per-slot values (`fcn.140bcbfe0`)
  - emit an event payload into a shared dispatcher (`fcn.140bafc20`) with codes like `0x602` / `0x604`.
- Evidence:
  - `mod/一键整合包-v1.1/.tmp_data/input_pipeline_rz_extract_20260225_v2.txt:184`
  - `mod/一键整合包-v1.1/.tmp_data/input_pipeline_rz_helpers_20260225.txt:26`
  - `mod/一键整合包-v1.1/.tmp_data/input_pipeline_rz_helpers_20260225.txt:114`
  - `mod/一键整合包-v1.1/.tmp_data/input_pipeline_rz_helpers_20260225.txt:73`
  - `mod/一键整合包-v1.1/.tmp_data/input_pipeline_rz_helpers_20260225.txt:127`

### 4.19 Shared dispatcher entrypoint `fcn.140bafc20` identified (Confirmed)
- `fcn.140bafc20` is called by multiple input helpers (and many other subsystems) and appears to be a shared "enqueue/dispatch" entrypoint:
  - ensures an internal pointer at `[rcx + 8]` exists (allocates on-demand),
  - then calls `fcn.140bafad0` to push/dispatch with `edx = 1`.
- Evidence:
  - `mod/一键整合包-v1.1/.tmp_data/input_dispatcher_bafc20_rz_20260225.txt:57`
  - `mod/一键整合包-v1.1/.tmp_data/input_dispatcher_bafc20_rz_20260225.txt:81`

### 4.20 Event queue insertion function `fcn.140badcb0` identified (Confirmed)
- `fcn.140badcb0` enqueues a fixed-size event payload into an internal queue:
  - allocates/reuses a node (`size = 0x98`),
  - copies `0x80` bytes from the event struct (`movups` blocks),
  - links it into a global queue and updates counters (logs "Event queue is full" when saturated).
- Implication for input RE:
  - input events like `0x602`/`0x604` are first written into an `0x80`-byte event struct, then enqueued by `fcn.140badcb0`.
- Evidence:
  - `mod/一键整合包-v1.1/.tmp_data/input_dispatcher_badcb0_rz_20260225.txt:3`
  - `mod/一键整合包-v1.1/.tmp_data/input_dispatcher_badcb0_rz_20260225.txt:14`
  - `mod/一键整合包-v1.1/.tmp_data/input_dispatcher_badcb0_rz_20260225.txt:39`

### 4.21 SDL-like event queue consumer primitives identified (Confirmed)
- The event queue head/tail/free-list globals are actively used by a set of functions that match an SDL-style queue:
  - `data.1413a1698`: head
  - `data.1413a16a0`: tail
  - `data.1413a16a8`: free list head
  - `data.1413a168c`: in-flight count (atomic +/- via `fcn.140badc40`)
- `fcn.140badfa0(event_node*)` removes a node from the queue (fixes `prev/next`, updates head/tail if needed), pushes it onto the free list, and decrements `data.1413a168c`.
- `fcn.140bae140(callback, ctx)` iterates the current queue and calls `callback(ctx, node)`; if callback returns `false`, it removes the node via `fcn.140badfa0`.
- `fcn.140bae1d0(type)` is a flush-by-type wrapper: removes queued events whose `event.type` equals `type` (implemented as a range flush where `min=max=type`).
- Evidence:
  - `mod/一键整合包-v1.1/.tmp_data/input_event_queue_candidates_pdf_20260225.txt:1`
  - `mod/一键整合包-v1.1/.tmp_data/input_event_queue_candidates_pdf_20260225.txt:63`
  - `mod/一键整合包-v1.1/.tmp_data/input_event_queue_candidates_pdf_20260225.txt:112`
  - `mod/一键整合包-v1.1/.tmp_data/input_event_queue_candidates_pdf_20260225.txt:148`

### 4.22 Event push path callsite in `fcn.140c29360` found (Confirmed)
- `fcn.140c29360` builds an `0x80`-byte event payload on-stack (`var_98h`), then:
  - conditionally calls `fcn.140bae140` with `callback = 0x140c29260` and `ctx = &var_98h` (likely queue compaction / coalescing for certain event types),
  - then enqueues the new event via `fcn.140bafc20(&var_98h)`.
- Evidence:
  - `mod/一键整合包-v1.1/.tmp_data/input_event_pump_c29360_rz_20260225.txt:244`

### 4.23 `fcn.140baf8e0` matches SDL3 `SDL_PeepEvents` add/peek/get semantics (Confirmed)
- `fcn.140baf8e0` implements SDL-style queue operations over the global head/tail pointers:
  - `action == 0` path pushes events from a caller buffer (calls `fcn.140badcb0` in a loop with 0x80 stride).
  - `action != 0` path iterates queued events and can remove nodes when `action == 2` (calls `fcn.140badfa0` after copying the 0x80 event payload).
- This is the missing "pop/consume" primitive needed for in-process input injection testing.
- Evidence:
  - `mod/一键整合包-v1.1/.tmp_data/input_dispatcher_baf8e0_rz_20260225.txt:40`
  - `mod/一键整合包-v1.1/.tmp_data/input_dispatcher_baf8e0_rz_20260225.txt:81`
  - `mod/一键整合包-v1.1/.tmp_data/input_dispatcher_baf8e0_rz_20260225.txt:120`
  - `mod/一键整合包-v1.1/.tmp_data/input_dispatcher_baf8e0_rz_20260225.txt:122`

### 4.24 SDL DynAPI stubs are present in `Mewgenics.exe` for stable in-process calls (Confirmed)
- The binary contains `sym.Mewgenics.exe_SDL_*` stubs (DynAPI) that jump through a function pointer table.
- This provides stable "API-level" entrypoints for automation tooling, including:
  - `SDL_PushEvent`
  - `SDL_GetWindows`
  - `SDL_GetWindowSizeInPixels`
  - `SDL_GetWindowID`
  - `SDL_GetMouseFocus` / `SDL_GetKeyboardFocus`
- Evidence:
  - `mod/一键整合包-v1.1/.tmp_data/sdl_dynapi_stub_addrs_rz_20260225.txt:1`
  - `mod/一键整合包-v1.1/.tmp_data/sdl_dynapi_stub_addrs_rz_20260225.txt:2`
  - `mod/一键整合包-v1.1/.tmp_data/sdl_dynapi_stub_addrs_rz_20260225.txt:3`
  - `mod/一键整合包-v1.1/.tmp_data/sdl_dynapi_stub_addrs_rz_20260225.txt:4`
  - `mod/一键整合包-v1.1/.tmp_data/sdl_dynapi_stub_addrs_rz_20260225.txt:5`
  - `mod/一键整合包-v1.1/.tmp_data/sdl_dynapi_stub_addrs_rz_20260225.txt:6`

### 4.25 SDL in-process click backend implemented via Frida (Confirmed: code exists; runtime effect pending)
- Added a Frida agent that pushes SDL3 mouse motion + button events directly via `SDL_PushEvent`.
- Integrated as a new click backend:
  - `tools/runtime/house_actions.py --backend sdl`
- Evidence:
  - `mod/一键整合包-v1.1/tools/runtime/sdl_frida_agent.js`
  - `mod/一键整合包-v1.1/tools/runtime/sdl_frida_input.py`
  - `mod/一键整合包-v1.1/tools/runtime/house_actions.py`
  - `mod/一键整合包-v1.1/tools/runtime/README_UI_AUTOMATION.md`

### 4.26 SDL DynAPI stubs for queue inspection + polling confirmed (Confirmed)
- `SDL_PeepEvents`, `SDL_PollEvent`, `SDL_PumpEvents` are present as `sym.Mewgenics.exe_SDL_*` stubs in the current binary.
- These are the missing pieces to answer: "are injected events actually in the queue / are they being consumed?"
- Evidence:
  - `mod/一键整合包-v1.1/.tmp_data/sdl_dynapi_stubs_poll_peep_rz_20260225.txt:1`
  - `mod/一键整合包-v1.1/.tmp_data/sdl_dynapi_stubs_poll_peep_rz_20260225.txt:2`
  - `mod/一键整合包-v1.1/.tmp_data/sdl_dynapi_stubs_poll_peep_rz_20260225.txt:3`
  - `mod/一键整合包-v1.1/.tmp_data/sdl_dynapi_stubs_poll_peep_rz_20260225.txt:4`

### 4.27 SDL backend debug hooks + warp-click mode added (Confirmed: code exists; runtime effect pending)
- Frida agent now exposes:
  - `peep(...)`: inspect SDL event queue via `SDL_PeepEvents`
  - `enablepollhook(...)` + `pollstats()`: count consumed events via an `SDL_PollEvent` hook
- House actions now support `--backend sdl-warp` (warp mouse before click) to handle games that read cached mouse coordinates.
- Evidence:
  - `mod/一键整合包-v1.1/tools/runtime/sdl_frida_agent.js`
  - `mod/一键整合包-v1.1/tools/runtime/sdl_frida_input.py`
  - `mod/一键整合包-v1.1/tools/runtime/house_actions.py`

### 4.28 End Day / Next Day trigger chain located (Confirmed: static RE)
- Gate/handler:
  - `fcn.1401eb410` sets `[this+0xb0]=1`, checks `data.1413b3168` state, resolves a `House*`, then calls `fcn.1401f36a0` to construct/schedule the end-day transition.
- Transition builder:
  - `fcn.1401f36a0` builds an `EndDayTransition` transition and prepares a `glaiel::House::PassDay` lambda (vtable `0x140ef42f0`), then calls `fcn.1409ae3d0` to enqueue/start the transition.
- UI lookup (used for pointer caching hook):
  - `fcn.1401dc040` calls `fcn.1400519b0` with `"EndDay_Sign"` (name lookup).
- Evidence:
  - `mod/一键整合包-v1.1/.tmp_data/passday_callers_fns_rz_20260226_125211.txt:784`
  - `mod/一键整合包-v1.1/.tmp_data/passday_callers_fns_rz_20260226_125211.txt:798`
  - `mod/一键整合包-v1.1/.tmp_data/passday_pd_nocolor_rz_20260226_131140.txt:97`
  - `mod/一键整合包-v1.1/.tmp_data/passday_pd_nocolor_rz_20260226_131140.txt:108`
  - `mod/一键整合包-v1.1/.tmp_data/passday_pd_nocolor_rz_20260226_131140.txt:119`
  - `mod/一键整合包-v1.1/.tmp_data/endday_fns_rz_20260226_123458.txt:636`
  - `mod/一键整合包-v1.1/.tmp_data/endday_fns_rz_20260226_123458.txt:637`

### 4.29 Native End Day trigger backend implemented (Confirmed: code exists; runtime effect pending)
- Frida agent now exposes `endday_request/endday_state` and dispatches the trigger call from inside the `SDL_PollEvent` hook (to run on the SDL loop thread).
- Added CLI helpers:
  - `python tools/runtime/sdl_frida_input.py endday-state`
  - `python tools/runtime/sdl_frida_input.py endday`
- `house_actions.py` now supports `--backend native`:
  - for `house_next_day`, it prefers the native trigger and falls back to an SDL click if native dispatch cannot cache the sign pointer yet.
- Evidence:
  - `mod/一键整合包-v1.1/tools/runtime/sdl_frida_agent.js`
  - `mod/一键整合包-v1.1/tools/runtime/sdl_frida_input.py`
  - `mod/一键整合包-v1.1/tools/runtime/house_actions.py`

### 4.30 Poop objects can be cleaned via save-write (Confirmed)
- Poop exists as `furniture` table rows with object name `poop`, and each row's blob header includes a room ID (for example: `Floor1_Large`, `Floor1_Small`, `Attic`).
- This enables stable cleanup without coordinate clicks:
  - delete matching `furniture.key` rows for `object_name == poop`, optionally excluding combat rooms.
- Combat room detection can be driven by:
  - `strategy_settings.json` (`room_roles.combat_rooms`), or
  - auto-detect from poop density (combat rooms tend to accumulate poop) via `--auto-combat-from-poop`.
- Evidence:
  - `mod/一键整合包-v1.1/tools/runtime/clean_house_poop.py`
  - `mod/一键整合包-v1.1/.tmp_data/house_poop_clean_plan_latest.json`

### 4.31 Strategy-driven room rehome is deterministic and settings-driven (Confirmed)
- Room semantics are **user-configurable** via `tools/runtime/strategy_settings.json`:
  - `room_roles.breeder_main_rooms`
  - `room_roles.breeder_secondary_rooms`
  - `room_roles.combat_rooms`
- The strategy builder uses room roles to define the default breeding pool (`pair_pool_mode=breeder_rooms`) and falls back to broader pools if needed.
- The rehome tool:
  - ranks active cats by: MCTS `best_branch` membership -> top `pair_ranking` membership -> all-7 stat score,
  - assigns cats to rooms by preserving each room’s existing active-cat count and filling rooms in order:
    - breeder-main rooms -> breeder-secondary rooms -> combat rooms -> remaining rooms (sorted).
- Evidence:
  - `mod/一键整合包-v1.1/tools/runtime/strategy_settings.json:1`
  - `mod/一键整合包-v1.1/tools/runtime/build_cattery_strategy.py:493`
  - `mod/一键整合包-v1.1/tools/runtime/build_cattery_strategy.py:497`
  - `mod/一键整合包-v1.1/tools/runtime/rehome_house_rooms.py:189`
  - `mod/一键整合包-v1.1/tools/runtime/rehome_house_rooms.py:228`
  - `mod/一键整合包-v1.1/tools/runtime/rehome_house_rooms.py:237`
  - `mod/一键整合包-v1.1/tools/runtime/rehome_house_rooms.py:256`

### 4.32 Room Comfort/Stimulation can be computed from furniture placement (Confirmed)
- Room effects are derivable from the save by joining:
  - `furniture` table blobs (object name + room id), and
  - `furniture_effects.gon` (numeric effect keys: Comfort/Stimulation/Appeal/Health/etc).
- Notable effect keys/examples present in `furniture_effects.gon` (useful for room-role inference + maintenance automation):
  - `poop`: `Comfort -2`, `Health -2`
  - `special_fightidol`: `Comfort -5`, `FightBonusRewards 1`, `FightRisk 2`
  - `special_suppressoridol`: `Comfort 5`, `BreedSuppression 1`
- Implemented:
  - `tools/runtime/room_effects.py` helper (parse effects + aggregate per-room sums),
  - `tools/runtime/report_room_effects.py` (read-only reporting),
  - `tools/runtime/export_cattery_data.py` now includes `room_effects` in the export JSON.
- Evidence:
  - `mod/一键整合包-v1.1/tools/runtime/room_effects.py`
  - `mod/一键整合包-v1.1/tools/runtime/report_room_effects.py`
  - `mod/一键整合包-v1.1/tools/runtime/export_cattery_data.py`
  - `mod/一键整合包-v1.1/tools/runtime/README_DATA.md`
  - `mod/模组加载器v1.2/_internal/base_data/data/furniture_effects.gon:1`

### 4.33 Auto room-role inference is available for multi-save layouts (Confirmed)
- The runtime can suggest room semantics from save-derived signals (room effects + fight signals/breeding suppression + optional poop density fallback) and use it instead of hardcoded room IDs:
  - `build_cattery_strategy.py --auto-room-roles`
  - `rehome_house_rooms.py --auto-room-roles`
  - `run_strategy_pipeline.py --auto-room-roles`
- This is intended for players with different house layouts (single-room saves, no combat room, etc.).
- Manual override via `tools/runtime/strategy_settings.json -> room_roles` remains supported.
- Evidence:
  - `mod/一键整合包-v1.1/tools/runtime/room_effects.py`
  - `mod/一键整合包-v1.1/tools/runtime/build_cattery_strategy.py`
  - `mod/一键整合包-v1.1/tools/runtime/rehome_house_rooms.py`
  - `mod/一键整合包-v1.1/tools/runtime/run_strategy_pipeline.py`

### 4.34 Inbreeding (COI) penalties for birth defects are known (Confirmed; external RE evidence)
- The game uses an `inbreeding_coef` (COI) scalar to gate two distinct “birth defect” systems:
  - a birth-defect *disorder* (adds a disorder entry), and
  - birth-defect *parts* (physical defect parts, possibly multiple).
- Birth-defect disorder:
  - Only considered when `num_inherited_disorders < 2`.
  - Chance: `0.02 + 0.4 * clamp(COI - 0.2, 0, 1)`.
  - Practical implication: below `COI <= 0.2`, this stays at a flat `2%`.
- Birth-defect parts:
  - Only considered when `COI > 0.05`.
  - Trigger condition: `rand_uniform < COI * 1.5` (so ~`1.5 * COI` chance when eligible).
  - Count: `1` if `COI <= 0.9`, else `2`.
- Inferred:
  - Community reports showing `COI=6.25%` (“slightly inbred”) strongly suggests the displayed COI aligns with standard pedigree COI math (for example, first-cousin mating yields `6.25%`).
- Evidence:
  - External reverse-engineering note (SciresM gist, updated 2026-02-27): `https://gist.github.com/SciresM/95a9dbba22937420e75d4da617af1397`
  - Community observation thread (COI display example): `https://www.reddit.com/r/Mewgenics/comments/1kr1fxb/slightly_inbred_kitten/`

### 4.35 COI can be computed from the save pedigree (Confirmed; best-effort parse)
- `files.pedigree` blob contains enough parent-link information to compute a standard pedigree COI (inbreeding coefficient, aka `F`) per cat.
- Implemented:
  - `tools/runtime/pedigree.py`:
    - heuristic scan of `files.pedigree` to extract `(parent_a_id, parent_b_id)` for each `cat_id`,
    - Henderson-style `A` matrix build (O(n^2)) to compute COI under the assumption that unknown parents are unrelated founders.
  - `tools/runtime/report_pedigree_coi.py` to print the highest-COI cats for a save.
  - `tools/runtime/export_cattery_data.py` now attaches `parent_a_id`, `parent_b_id`, `coi`, `coi_pct` to exported cats and includes a `pedigree` summary block.
- Notes / Unknowns:
  - The exact binary structure of `files.pedigree` is not fully decoded; current approach is a best-effort pattern scan that has stable coverage on the current save.
  - Parent ordering (mom vs dad) is not currently inferred; IDs are kept as `parent_a_id/parent_b_id`.
- Evidence:
  - `mod/一键整合包-v1.1/tools/runtime/pedigree.py`
  - `mod/一键整合包-v1.1/tools/runtime/report_pedigree_coi.py`
  - `mod/一键整合包-v1.1/tools/runtime/export_cattery_data.py`
  - `mod/一键整合包-v1.1/.tmp_data/pedigree_coi_report_slot1_20260227_222952.txt`

### 4.36 Stimulation-driven inheritance odds (Confirmed; external RE evidence)
- For each base stat, the chance to inherit the *better* stat increases with room `Stimulation`:
  - `p_better = (1 + 0.01 * Stimulation) / (2 + 0.01 * Stimulation)`
- Spell inheritance odds (per kitten):
  - 1st spell: `p = clamp01(0.2 + 0.025 * Stimulation)` (reaches 100% at `Stimulation >= 32`)
  - 2nd spell: `p = clamp01(0.02 + 0.005 * Stimulation)`
- Passive inheritance odds:
  - `p = clamp01(0.05 + 0.01 * Stimulation)` (reaches 100% at `Stimulation >= 95`)
- Disorder inheritance odds:
  - Each parent disorder has `15%` pass chance independently.
- Evidence:
  - External reverse-engineering note (SciresM gist, updated 2026-02-27): `https://gist.github.com/SciresM/95a9dbba22937420e75d4da617af1397`

### 4.37 Libido/Sexuality/Aggression and lover/hater can be decoded from `cats.data` (Confirmed)
- From the LZ4-decoded `cats.data` blob, the first `b"None"` token anchors a compact fixed-layout segment containing:
  - `libido` (f64, 0..1) + bucket (<0.3 low, >0.7 high)
  - `sexuality` (f64, 0..1) + bucket (<0.1 straight, >0.9 gay, else bi)
  - `aggression` (f64, 0..1) + bucket (<0.3 low, >0.7 high)
  - `lover_id` (i64, -1 means none) + `lover_strength` (f64, 0..1; 0 if none)
  - `hater_id` (i64, -1 means none) + `hater_strength` (f64, 0..1; 0 if none)
- Implemented in:
  - `mod/一键整合包-v1.1/tools/runtime/watch_save_state.py` (`_extract_hidden_social_fields`)
  - Exported by default via `mod/一键整合包-v1.1/tools/runtime/export_cattery_data.py`
- Evidence:
  - `mod/一键整合包-v1.1/tools/runtime/watch_save_state.py`
  - `mod/一键整合包-v1.1/.tmp_data/fcn_1400dec80_clean.txt:2283` (sexuality @ `+0xbc0`)
  - `mod/一键整合包-v1.1/.tmp_data/fcn_1400dec80_clean.txt:2597` (libido @ `+0xbb8`)
  - `mod/一键整合包-v1.1/.tmp_data/fcn_1400dec80_clean.txt:2365` (aggression @ `+0xbe8`)
  - `mod/一键整合包-v1.1/.tmp_data/fcn_1400dec80_clean.txt:3148` (lover/hater IDs @ `+0xbc8/+0xbd8`)

### 4.38 Breeding rejection attraction scalar can be reconstructed (Confirmed)
- The breeding flow calls `fcn.1400cf880` and rejects the pair when `score < 0.05`:
  - `mod/一键整合包-v1.1/.tmp_data/fcn_1401e47e0_clean.txt:2163` (0.05 constant)
  - `mod/一键整合包-v1.1/.tmp_data/fcn_1401e47e0_clean.txt:2198` (call)
  - `mod/一键整合包-v1.1/.tmp_data/fcn_1401e47e0_clean.txt:2200` (compare/jump)
- `fcn.1400cf880` computes directed attraction A→B:
  - hard gates before scalar math:
    - reject self-pair (`[arg1+0xc48] == [arg2+0xc48]`)
    - reject if partner fails `fcn.1400d0210` (semantics still unknown; see **6.1**)
    - reject if either cat is marked `no_breed` (bit `0x200000` at `[cat+0xbf8]`, set from the `"no_breed"` catdata property)
  - Evidence:
    - `mod/一键整合包-v1.1/.tmp_data/fcn_1400cf880_plain.txt:19` (self-pair id compare)
    - `mod/一键整合包-v1.1/.tmp_data/fcn_1400cf880_plain.txt:22` (`fcn.1400d0210` gate)
    - `mod/一键整合包-v1.1/.tmp_data/fcn_1400cf880_plain.txt:25` (`+0xbf8` bit-21 test)
    - `mod/一键整合包-v1.1/.tmp_data/fcn_1400a7300_clean.txt:456` (reads `"no_breed"` property)
    - `mod/一键整合包-v1.1/.tmp_data/fcn_1400a7300_clean.txt:485` (sets `0x200000` into `+0xbf8`)
    - `mod/模组加载器v1.2/_internal/base_data/data/special_strays.gon:41` (`no_breed true` examples)
  - axis component from A's `sexuality` and `libido` (same vs opposite sex; neutral uses magnitude):
    - `mod/一键整合包-v1.1/.tmp_data/fcn_1400cf880_plain.txt:33` (read sexuality @ `+0xbc0`)
    - `mod/一键整合包-v1.1/.tmp_data/fcn_1400cf880_plain.txt:34` (angle scale constant `pi/2`)
    - `mod/一键整合包-v1.1/.tmp_data/fcn_1400cf880_plain.txt:39` (sincos helper)
    - `mod/一键整合包-v1.1/.tmp_data/fcn_1400cf880_plain.txt:52` (sex-code axis selection)
    - Community UI label: sex-code `2` ("neutral") appears as the `?` / "ditto" icon and can breed with any sex (still treated as Inferred):
      - `https://steamcommunity.com/sharedfiles/filedetails/?id=3664011595`
  - lover bias multiplier `1 +/- lover_strength`:
    - `mod/一键整合包-v1.1/.tmp_data/fcn_1400cf880_plain.txt:63` (lover id @ `+0xbc8`)
    - `mod/一键整合包-v1.1/.tmp_data/fcn_1400cf880_plain.txt:67` (lover strength @ `+0xbd0`)
  - multiply by partner charisma and constant `0.15`:
    - `mod/一键整合包-v1.1/.tmp_data/fcn_1400cf880_plain.txt:84` (charisma field @ `+0x14`)
    - `mod/一键整合包-v1.1/.tmp_data/fcn_1400cf880_plain.txt:88` (0.15 constant)
- Implemented data-only approximation:
  - `mod/一键整合包-v1.1/tools/runtime/breeding_compat.py`
  - `mod/一键整合包-v1.1/tools/runtime/report_breeding_compat.py`

### 4.39 Room comfort/crowding multiplier + BreedSuppression gate (Confirmed)
- `fcn.1402e5c60` computes a per-room breeding factor and writes it to `[room+0x120]`:
  - crowding penalty uses `dword[room+0x6c]` (cat count) and starts after 4 cats:
    - `crowd_penalty = max(0, dword[room+0x6c] - 4)`
    - `factor = 1.0 - 0.1 * crowd_penalty` (0.1 constant at `data.1411312b0`)
  - then iterates room effects and calls `fcn.1401b0420` with id `27` (`Comfort`) to add comfort contribution into `[room+0x120]`:
    - `edx = 0x1b` and `r8 = &room[0x120]`
- In the pair accept loop, the engine uses `sqrt([room+0x120])` as the multiplier passed into the accept roll (`fcn.1400cfae0`).
- `BreedSuppression` is a hard gate:
  - the engine loads `0.99` into `xmm7`, calls `fcn.1401b1470` with effect id `0x10` (16), and skips when `BreedSuppressionPower > 0.99`.
  - effect id `0x10` maps to `"BreedSuppression"` in the effect resolver (`fcn.1401b0420`).
- Implemented (data-only):
  - `mod/一键整合包-v1.1/tools/runtime/breeding_compat.py` (`room_breeding_multiplier`, `accept_probability`)
  - `mod/一键整合包-v1.1/tools/runtime/report_breeding_compat.py` (`--room best|none|<id>`, prints `p_accept_*`)
  - `mod/一键整合包-v1.1/tools/runtime/export_cattery_data.py` exports `breed_factor_est` / `breed_multiplier_est` / `breed_suppressed_est` per room.
- Evidence:
  - `mod/一键整合包-v1.1/.tmp_data/fcn_1402e5c60_clean.txt:15` (`dword[room+0x6c]`)
  - `mod/一键整合包-v1.1/.tmp_data/fcn_1402e5c60_clean.txt:31` (`0.1` scaling)
  - `mod/一键整合包-v1.1/.tmp_data/fcn_1402e5c60_clean.txt:33` (store `[room+0x120]`)
  - `mod/一键整合包-v1.1/.tmp_data/fcn_1402e5c60_clean.txt:41` (`edx=0x1b` Comfort id + `r8=&[room+0x120]`)
  - `mod/一键整合包-v1.1/.tmp_data/fcn_1401e47e0_clean.txt:1405` (call `fcn.1402e5c60`)
  - `mod/一键整合包-v1.1/.tmp_data/fcn_1401e47e0_clean.txt:1407` (`sqrtpd` multiplier)
  - `mod/一键整合包-v1.1/.tmp_data/fcn_1401e47e0_clean.txt:1411` (call `fcn.1400cfae0`)
  - `mod/一键整合包-v1.1/.tmp_data/fcn_1401e47e0_clean.txt:1332` (`0.99` constant load)
  - `mod/一键整合包-v1.1/.tmp_data/fcn_1401e47e0_clean.txt:1353` (pass `0x10` to `fcn.1401b1470`)
  - `mod/一键整合包-v1.1/.tmp_data/fcn_1401e47e0_clean.txt:1356` (`BreedSuppressionPower > 0.99` check)
  - `mod/一键整合包-v1.1/.tmp_data/fcn_1401b0420_clean.txt:427` (`"BreedSuppression"` string)

## 5. Implemented Mod State
Bundle path:
- `f:\SteamLibrary\steamapps\common\Mewgenics\mod\一键整合包-v1.1`

Key mod present:
- `EconomyBalanceFoodButton100`
  - `info.json`
  - `data/difficulties.gon.patch`
  - `data/shops/combat_shops.gon.patch`
  - `data/shops/tracy_house_shop.gon.patch`
  - `data/shops/jack_shop.gon.patch`
- `NpcFavorHalf`
  - `data/npc_favor_unlocks.gon`

Known intent (from current patch content):
- Tracy shop has `0` cost `+100` food option in guaranteed food group.
- Jack shop includes a `0` cost `FurnitureBox` entry.

Loader mechanism (Confirmed):
- `mod/模组加载器v1.2/MewLoader.exe` is a PyInstaller one-folder Python app (bundles `python312.dll` and stdlib in `_internal/`).
- It does not perform DLL/remote-thread injection into `Mewgenics.exe`; instead it deploys/modifies **loose data files on disk** under the game folder (for example `data/shops/jack_shop.gon`).
- Deployed outputs are tracked in the game root:
  - `.mewloader_manifest.json` (file list, source mods, hashes, deploy time)
- PyInstaller archive was extracted for inspection:
  - `mod/模组加载器v1.2/.tmp_extract/MewLoader.exe_extracted/core/*.pyc`
  - `mod/模组加载器v1.2/.tmp_extract/MewLoader.exe_extracted/ui/*.pyc`
- Patch/merge semantics (Confirmed from extracted bytecode docstrings):
  - `.gon.patch` is a partial GON overlay applied via deep merge:
    - patch keys override base keys
    - dict values merge recursively
    - arrays/simple values overwrite
    - base keys not present in patch are preserved
  - `.csv.append` merge rules:
    - keep first header (if present)
    - append all data rows
    - same `KEY` (first column) collisions: later mod overrides earlier
    - supports multiline CSV fields (quoted newlines)
  - Conflict detection normalizes `.gon.patch` -> `.gon`; multi-mod patches to the same target are treated as mergeable (like `.csv.append`).
- No runtime injection code paths were found in `core/*` or `ui/*` imports/strings; the loader operates by file deployment + deterministic cleanup via manifest hashes.
- Evidence:
  - `mod/模组加载器v1.2/_internal/python312.dll`
  - `mod/模组加载器v1.2/mewloader.log`
  - `.mewloader_manifest.json`
  - `mod/模组加载器v1.2/.tmp_data/mewloader_key_doc_20260226_120852.txt:4`
  - `mod/模组加载器v1.2/.tmp_data/mewloader_pyc_scan_20260226_120451_utf8.txt:4`

## 6. Open Questions and Risks
### 6.1 Compatibility formula (Partially known)
- The *attraction scalar* used by the pair rejection gate is now reconstructed (**4.38**) and the needed hidden fields are now extracted from the save (**4.37**).
- Remaining unknowns / missing gates:
  - Exact semantics of `fcn.1400d0210` (availability gate; still unmapped to save-side flags).
  - Whether the hater relationship (`+0xbd8`) is used in a separate multiplier path (not observed in `fcn.1400cf880`).
- Inbreeding’s *birth defect* penalty sub-formulas are known (see **4.34**), but:
  - COI computation/storage in the save is still unknown, and
  - whether COI contributes to compatibility allow/reject probability (beyond birth defects) is still unknown.
- Resolved gates:
  - The `+0xbf8` bit-21 gate inside `fcn.1400cf880` is `no_breed` (bit `0x200000`), set from the `"no_breed"` catdata property (see **4.38**).
- Next validation plan (in-engine):
  - Log accept/reject decisions for many attempted pairs and compare to offline-predicted `p_accept_both` under the observed room multiplier.
  - Then resolve remaining cat availability flags (`fcn.1400d0210`) and any missing relationship multipliers until predictions match held-out samples.
- Related blocker for “auto send cats away”:
  - Death flag is decoded (`status_flags` bit `0x0020`); remaining is age/day counters (for “auto retire/rehome” policies), not corpse detection.
- Evidence anchors already present:
  - Sex-code gate + reject text routes: `mod/一键整合包-v1.1/.tmp_data/breeding_mechanics_extracted_v3.md`

### 6.2 Full inheritance stack closure (Partially known)
- Base stat chooser is known.
- External RE provides numeric inheritance odds for spells/passives/disorders as a function of `Stimulation` (see **4.36**), but the complete runtime chain (ability IDs, mutation interactions, how every inherited trait is stored in `cats.data`) is not fully mapped end-to-end.

### 6.3 Runtime integration risk (High)
- Realtime capture and automation may require:
  - memory/offset handling across game updates
  - robust focus/window/input handling
  - fallback when UI state changes

### 6.4 Mod visibility/loading uncertainty (Operational)
- Historical reports indicated occasional mismatch between expected and visible shop entries.
- Likely causes include wrong load path, stale cache, or load-order conflicts; requires deterministic loader-state checklist each test cycle.

### 6.5 Input injection capability variance (Unknown)
- It is unresolved whether the cursor-injection failure is caused by:
  - privilege/session boundary,
  - VM/remote desktop constraints,
  - or process/window mode differences.
- Also note: the game is driven by Raw Input (`WM_INPUT` / `GetRawInputData`), so `PostMessageW(WM_LBUTTONDOWN/UP)` is not expected to be a reliable automation path.
- Status update:
  - Win32 cursor injection can remain unreliable, but an in-process SDL click backend exists (`--backend sdl`) and should be the primary validation path for house actions.
  - The Win32 rect seen by the controller process is DPI-virtualized (`2560x1440`) while SDL sees the physical window (`3840x2160`); SDL backend must not use Win32 sizes as the injected coordinate base.
  - The SDL backend now logs Win32-vs-SDL sizes and supports `--backend sdl-warp` for cached-mouse-state paths (still needs in-game verification).
- Until SDL injection is verified in-game, runtime click automation must still mark house actions as non-authoritative.

### 6.6 House-action no-op root cause (Partially explained)
- SDL injection transport is confirmed (events are returned by `SDL_PollEvent`).
- Remaining likely causes for house-action no-ops:
  - point misalignment (outdated/mis-recorded `ui_points.json`),
  - scene/focus mismatch,
  - unmet in-game preconditions for target buttons.

### 6.7 Room semantic classification mapping (Solved heuristically; manual override supported)
- Manual mapping exists in `tools/runtime/strategy_settings.json` (`room_roles.*`) and is consumed by:
  - `build_cattery_strategy.py` (breeder pool grouping / pair pool),
  - `rehome_house_rooms.py` (room assignment policy: keep counts vs `--repartition`).
- Auto mapping now exists for multi-save robustness:
  - derive `room_roles` from save-derived room effects, preferring explicit fight signals/breeding suppression, with poop density as a fallback (`--auto-room-roles`).
  - poop cleanup can also auto-exclude combat rooms from room effects (`clean_house_poop.py --auto-combat-from-effects`), not only from poop density.
- A role-based "cat classification" mode now exists for save-write rehome:
  - `rehome_house_rooms.py --repartition` can actually change per-room cat counts (breeder rooms capped; overflow routed to combat rooms).
  - the one-click batch (`mod/一键整合包-v1.1/一键整理.bat`) uses `--repartition` by default to make changes visible.
- Evidence:
  - `mod/一键整合包-v1.1/tools/runtime/strategy_settings.json:1`
  - `mod/一键整合包-v1.1/tools/runtime/room_effects.py`
  - `mod/一键整合包-v1.1/tools/runtime/build_cattery_strategy.py`
  - `mod/一键整合包-v1.1/tools/runtime/rehome_house_rooms.py`
  - `mod/一键整合包-v1.1/tools/runtime/run_strategy_pipeline.py`

### 6.8 Save-write rehome effect (Unknown)
- Rewriting `files.house_state` parses cleanly and can be applied at the SQLite layer, but it is not yet confirmed whether:
  - the running game session will reflect changes without reload, and
  - the game tolerates aggressive rehoming across all scenes.
- Acceptance check:
  - Apply `tools/runtime/rehome_house_rooms.py --apply`, then verify in-game house/cattery room assignment matches the plan.
- If live reload is not supported:
  - Treat save-write rehome as a between-session/between-day operation (apply while game is closed, then reload the save), or
  - Extract and call the internal "drop/move cat to room" handler by tracing one manual drag/drop and turning it into a callable RPC (Frida), avoiding coordinate clicks while staying in-process.

### 6.9 Interstitial continue/advance by function call (Unknown)
- Goal: replace coordinate clicks on `house_interstitial_continue` with a direct call to the active interstitial scene's "continue/close" method.
- Static RE located `InterstitialScene` virtual method entrypoints; runtime mapping to the UI continue action is not yet confirmed.
- Current practical workaround remains SDL clicking at `house_interstitial_continue` while we map a callable function.
- Evidence:
  - `mod/一键整合包-v1.1/.tmp_data/interstitial_virtuals_pd_rz_20260226_134304.txt:1`

### 6.10 COI computation + `files.pedigree` decode (Solved heuristically; in-game validation pending)
- We can now compute COI from the save by extracting parent links from `files.pedigree` (see **4.35**).
- Remaining open items:
  - Confirm computed COI matches the in-game UI display for several known relationships (founder, first cousins, siblings, parent-child).
  - Fully decode `files.pedigree` format (beyond parent links) if we need richer genealogy features or faster parsing.
  - Determine whether any per-cat COI field exists in `cats.data` (so we can cross-check and/or avoid any parse heuristics).
- Acceptance:
  - On a held-out set of controlled pairings, computed COI matches UI display (within rounding).

### 6.11 MCTS virtual-offspring assumptions (Open)
- MCTS adds "virtual cats" (IDs like `vm1`/`vf1`) as expected-offspring proxies; any code path that treats cat IDs as ints must be robust to these strings.
- Virtual cats currently carry default libido/sexuality, but do not carry fertility; under compatibility filtering, this can prune multi-generation breeding branches or distort rollout value.
- Next:
  - Add `virtual_fertility` to `strategy_settings.json` and propagate it into `_apply_action` virtual cats.
  - Verify MCTS can plan >1 generation under the offline compatibility model.

## 7. Milestone Plan
### M1: Rule reconstruction (in progress)
Acceptance:
- Stable evidence-backed model for breeding outcome and stat inheritance.
- Unknown areas explicitly listed with extraction plan.

### M2: Realtime in-game state capture (in progress)
Target outputs:
- Runtime snapshot schema (cats, house state, room effects, shop state).
- Capture pipeline that can refresh each day/action.
Acceptance:
- Can fetch and print current state without manual file editing.

### M3: Decision engine (in progress)
Target outputs:
- MCTS/optimizer over captured state.
- Action scoring function aligned with breeding objective (for example all-7 progression).
Acceptance:
- Given current state, returns reproducible recommended action plan.

### M4: In-game automation execution (in progress, blocked)
Target outputs:
- Automated action runner (next day, poop handling, selected house interactions).
- Safety guards and state checks before action.
Acceptance:
- Actions execute in-game and produce expected state changes.

Current execution batch (next concrete steps):
- Validate and tune room-semantic classification + save-write rehome:
  - room roles: configured (`strategy_settings.json`) + auto inference (`--auto-room-roles`) over save-derived room effects.
  - classification apply: `rehome_house_rooms.py --repartition` (breeder rooms capped; overflow routed to combat rooms).
  - Data collection (no in-game clicks required):
    - `python tools/runtime/report_room_effects.py` (human-readable)
    - `python tools/runtime/report_room_effects.py --json` (machine-readable)
    - `python tools/runtime/export_cattery_data.py --cat-limit 0` (includes `room_effects` + full cat list)
- Upgrade pair planner to multi-step strategy mode:
  - per-room cat assignment proposal
  - selectable policy (greedy / MCTS-lite).
- Compatibility (rule reconstruction):
  - Decoded libido/sexuality/aggression + lover/hater from `cats.data` and reconstructed the attraction scalar (see **4.37**/**4.38**).
  - Next: validate against in-engine accept/reject logs, then add remaining gates (comfort/crowding/BreedSuppression and availability flags) until predictions match held-out samples.
- Validate the native End Day trigger backend (function call; no coordinates for the primary action):
  - `python tools/runtime/sdl_frida_input.py endday-state`
  - `python tools/runtime/sdl_frida_input.py endday`
  - `python tools/runtime/house_actions.py advance-day --backend native --no-focus`
  - Acceptance: `current_day` increments and save fingerprint changes.
- Validate the SDL in-process click backend:
  - Run `python tools/runtime/sdl_frida_input.py info` while the game is running.
  - Run `python tools/runtime/sdl_frida_input.py pollstats --duration 2` to confirm the game is calling `SDL_PollEvent` (calls should increase).
  - Re-record points (recommended):
    - `python tools/runtime/record_house_mvp_points.py --backend sdl`
  - Run `python tools/runtime/house_actions.py advance-day --backend sdl` and confirm `current_day` increments + save fingerprint changes.
  - If `--backend sdl` no-ops, retry with `python tools/runtime/house_actions.py advance-day --backend sdl-warp`.
  - Run `python tools/runtime/house_actions.py take-inside --backend sdl` and confirm `house_state` delta.
- Continue input pipeline RE only if SDL injection cannot drive the required UI interactions reliably.
- Validate save-write room rehome path as an alternative to cursor injection.
  - Run `python tools/runtime/rehome_house_rooms.py --dry-run` to confirm plan and backups.
  - Run `python tools/runtime/rehome_house_rooms.py --apply` while the game is closed.
  - Acceptance: after loading the save, cats appear in the strategy-assigned rooms without any UI dragging.
- Validate save-write poop cleanup as a stable “one-key maintenance” action.
  - Run `python tools/runtime/clean_house_poop.py --dry-run`
  - Run `python tools/runtime/clean_house_poop.py --apply` while the game is closed.
  - Acceptance: after loading the save, poop is removed from targeted rooms (default: exclude combat rooms; `--include-combat` cleans all rooms).
- Decode cat age/death fields to enable safe “auto send away” classification.
  - Snapshot BEFORE/AFTER advancing 1 day:
    - `python tools/runtime/snapshot_save.py --label before`
    - advance day in-game, save, close
    - `python tools/runtime/snapshot_save.py --label after`
  - Diff:
    - `python tools/runtime/diff_saves.py before.sav after.sav --json`
    - `python tools/runtime/analyze_cat_blob_deltas.py before.sav after.sav`
  - Acceptance: identify stable field(s) that increment per-day across many cats and extract them into the export JSON as `age_days` / `life_stage`.
- Acceptance checks:
  - Planner can output stable top pair ranking directly from decoded save stats.
  - Room classifier produces deterministic labels for current house entries.
  - Given one snapshot, strategy output is reproducible.

## 8. Session Log
### 2026-02-28 - House automation: extra modal points for corpse collector / choice dialogs
Summary:
- Added optional `--extra-continue-point` (repeatable) + `--extra-continue-delay` to `house_actions.py advance-day` and `house_actions.py mvp` so the loop can dismiss/choose modal dialogs that block day advancement (example: dead cat corpse collector prompt).
- Wired the passthrough into `run_house_autoplay.py` and documented the workflow in `README_UI_AUTOMATION.md`.

Evidence:
- `mod/一键整合包-v1.1/tools/runtime/house_actions.py`
- `mod/一键整合包-v1.1/tools/runtime/run_house_autoplay.py`
- `mod/一键整合包-v1.1/tools/runtime/README_UI_AUTOMATION.md`

### 2026-02-28 - Breeding-first strategy loop: after-fix estimate + actionable CLI output + all7 shortest-steps MCTS objective
Summary:
- Strategy now reports an "after rehome + poop clean" estimate for breeder rooms and exposes `switch_est` so phase switching can be decided with fewer manual iterations.
- `run_strategy_pipeline.py` prints phase summary + breeding suggestions + a one-liner apply command for the common "move male into breeder rooms + clean poop" fix.
- Breeding-phase rehome ranking is improved to prefer cats with higher estimated breeding productivity (mutual accept probability + fertility), not just all-7 combat score.
- All-7 MCTS can now optimize for shortest steps to a target (default: `min>=7`) and reports per-step progress (`best_branch_progress`, `best_branch_steps_to_best/target`).

Evidence:
- `mod/一键整合包-v1.1/tools/runtime/build_cattery_strategy.py`
- `mod/一键整合包-v1.1/tools/runtime/strategy_settings.json`
- `mod/一键整合包-v1.1/tools/runtime/run_strategy_pipeline.py`
- `mod/一键整合包-v1.1/tools/runtime/rehome_house_rooms.py`

### 2026-02-27 - Community scan: stimulation formulas + sexuality hints (external)
Summary:
- Collected external RE/community sources for breeding mechanics:
  - Confirmed explicit `Stimulation` formulas for better-stat inheritance + spell/passive odds + per-parent disorder pass chance (see **4.36**).
  - Collected community references for sexuality/'?' rules and Tink unlock hints to help label fields for compatibility RE (still Inferred; see **6.1**).

Evidence:
- SciresM gist: `https://gist.github.com/SciresM/95a9dbba22937420e75d4da617af1397`
- Tink unlock notes: `https://mewgenics.wiki.gg/wiki/Tink`
- Steam guide (Breeding Basics; comfort/stimulation + gaydar/ditto `?` summary): `https://steamcommunity.com/sharedfiles/filedetails/?id=3664011595`
- Community sexuality threads:
  - `https://www.reddit.com/r/Mewgenics/comments/1l2wmje/gay_cats/`
  - `https://www.reddit.com/r/Mewgenics/comments/1lbq7h5/sooooo_does_anyone_know_what_these_question_mark/`

### 2026-02-27 - Community research: inbreeding penalties (external RE)
Summary:
- Added external RE-backed COI thresholds for birth defects into the tracker, so the planner can treat “light inbreeding is acceptable” as a quantified constraint.

Evidence:
- SciresM gist (birth defect formulas): `https://gist.github.com/SciresM/95a9dbba22937420e75d4da617af1397`
- COI display example thread: `https://www.reddit.com/r/Mewgenics/comments/1kr1fxb/slightly_inbred_kitten/`

### 2026-02-27 - Save pedigree parse + COI computation (data-only)
Summary:
- Implemented `files.pedigree` best-effort parsing to extract parent IDs and compute pedigree COI (`F`) for all cats in the save.
- Integrated COI into export JSON so the strategy layer can start penalizing runaway inbreeding.

Evidence:
- `mod/一键整合包-v1.1/tools/runtime/pedigree.py`
- `mod/一键整合包-v1.1/tools/runtime/report_pedigree_coi.py`
- `mod/一键整合包-v1.1/tools/runtime/export_cattery_data.py`
- `mod/一键整合包-v1.1/.tmp_data/pedigree_coi_report_slot1_20260227_222952.txt`

### 2026-02-27 - Decode libido/sexuality/relationships + reconstruct attraction scalar (data-only)
Summary:
- Decoded hidden social fields from `cats.data` into the export layer:
  - `libido` / `sexuality` / `aggression`
  - `lover_id/lover_strength` + `hater_id/hater_strength`
- Reconstructed the directed attraction scalar used for breeding rejection (`fcn.1400cf880`) and added a read-only report script to list top compatible pairs.

Evidence:
- `mod/一键整合包-v1.1/tools/runtime/watch_save_state.py`
- `mod/一键整合包-v1.1/tools/runtime/breeding_compat.py`
- `mod/一键整合包-v1.1/tools/runtime/report_breeding_compat.py`
- `mod/一键整合包-v1.1/.tmp_data/fcn_1400cf880_plain.txt:33`
- `mod/一键整合包-v1.1/.tmp_data/fcn_1401e47e0_clean.txt:2163`

### 2026-02-27 - Confirm room breeding gate (comfort/crowding + suppression) + integrate into compatibility report (RE + data-only)
Summary:
- Confirmed the room multiplier used by accept rolls (`sqrt([room+0x120])`) and the factor computation in `fcn.1402e5c60`.
- Confirmed BreedSuppression as a hard gate (`>0.99` for effect id `0x10`) and wired it into the data-only model.
- Export now includes per-room `breed_factor_est` / `breed_multiplier_est` / `breed_suppressed_est`, and compatibility report now prints directed/mutual accept probabilities under a chosen room context.

Evidence:
- `mod/一键整合包-v1.1/.tmp_data/fcn_1402e5c60_clean.txt:15`
- `mod/一键整合包-v1.1/.tmp_data/fcn_1402e5c60_clean.txt:31`
- `mod/一键整合包-v1.1/.tmp_data/fcn_1401e47e0_clean.txt:1405`
- `mod/一键整合包-v1.1/.tmp_data/fcn_1401e47e0_clean.txt:1407`
- `mod/一键整合包-v1.1/.tmp_data/fcn_1401e47e0_clean.txt:1356`
- `mod/一键整合包-v1.1/tools/runtime/breeding_compat.py`
- `mod/一键整合包-v1.1/tools/runtime/report_breeding_compat.py`
- `mod/一键整合包-v1.1/tools/runtime/export_cattery_data.py`

### 2026-02-25 - Preflight: deps installed; data-only pipeline runnable
Summary:
- Verified required Python deps are installed for the automation toolchain: `frida`, `frida-tools`, `pillow`, `lz4`.
- Ran the data-only pipeline successfully on current save (export -> strategy -> rehome plan).

Evidence:
- `mod/一键整合包-v1.1/tools/runtime/run_strategy_pipeline.py`
- `mod/一键整合包-v1.1/.tmp_data/cattery_data_latest.json`
- `mod/一键整合包-v1.1/.tmp_data/cattery_strategy_latest.json`
- `mod/一键整合包-v1.1/.tmp_data/house_rehome_plan_latest.json`

### 2026-02-25 - Autoplay loop runner for house MVP actions
Summary:
- Added `run_house_autoplay.py` to loop: strategy (optional) -> take-inside -> advance-day, with save-state verification.
- Default behavior is safe: only generates rehome plan unless `--rehome apply` is requested.

Evidence:
- `mod/一键整合包-v1.1/tools/runtime/run_house_autoplay.py`
- `mod/一键整合包-v1.1/tools/runtime/README_UI_AUTOMATION.md`

### 2026-02-25 - No-click pipeline + background-friendly no-focus flags
Summary:
- Added a one-command data-only runner (`run_strategy_pipeline.py`) to generate exports/strategy/rehome plan without any UI clicking.
- Added `--no-focus` option to house actions and stage-1 pipeline so runs can avoid stealing the foreground window.
- Updated runtime docs to reflect SDL point capture and background-friendly commands.

Evidence:
- `mod/一键整合包-v1.1/tools/runtime/run_strategy_pipeline.py`
- `mod/一键整合包-v1.1/tools/runtime/house_actions.py`
- `mod/一键整合包-v1.1/tools/runtime/run_cattery_pipeline.py`
- `mod/一键整合包-v1.1/tools/runtime/README_DATA.md`
- `mod/一键整合包-v1.1/tools/runtime/README_UI_AUTOMATION.md`

### 2026-02-25 - SDL automation: DPI base fix + Poll/Peep instrumentation + warp backend (pre-verification)
Summary:
- Fixed an important DPI mismatch: Win32 `GetWindowRect` is DPI-virtualized, so SDL injection must compute coords in SDL pixel space (not Win32 rect space).
- Added SDL queue/poll instrumentation primitives (PeepEvents + PollEvent hook) so we can prove whether injected events are present/consumed.
- Added `--backend sdl-warp` option to test cached-mouse-state driven UI flows.

Completed:
- Updated `house_actions.py` SDL backend to default to SDL window pixel sizes and log Win32 vs SDL sizes.
- Added `SDL_PeepEvents/SDL_PollEvent/SDL_PumpEvents` offsets to Frida agent and exposed:
  - `peep(...)`, `pump()`, `pollstats()` helpers.
- Added `sdl_frida_input.py pollstats` + `peep` commands.
- Updated runtime docs to include `sdl-warp` and debug helpers.

Open follow-ups:
- With the game running (in the house/cattery scene), run:
  - `python tools/runtime/sdl_frida_input.py pollstats --duration 2`
  - `python tools/runtime/house_actions.py advance-day --backend sdl-warp`
  - and confirm day/save deltas.

Evidence:
- `mod/一键整合包-v1.1/.tmp_data/sdl_dynapi_stubs_poll_peep_rz_20260225.txt`
- `mod/一键整合包-v1.1/tools/runtime/sdl_frida_agent.js`
- `mod/一键整合包-v1.1/tools/runtime/sdl_frida_input.py`
- `mod/一键整合包-v1.1/tools/runtime/house_actions.py`
- `mod/一键整合包-v1.1/tools/runtime/README_UI_AUTOMATION.md`

### 2026-02-25 - SDL DynAPI resolution + Frida SDL click backend added (pre-verification)
Summary:
- Identified SDL DynAPI stubs inside `Mewgenics.exe` and used them to build an in-process input injection backend.
- Implemented a Frida agent that injects SDL3 mouse motion + button events via `SDL_PushEvent`, and wired it into `house_actions.py` as `--backend sdl`.

Completed:
- Captured a minimal address map for SDL stubs needed for injection (`SDL_PushEvent`, `SDL_GetWindows`, `SDL_GetWindowSizeInPixels`, `SDL_GetWindowID`, focus helpers).
- Added `tools/runtime/sdl_frida_agent.js` + `tools/runtime/sdl_frida_input.py`.
- Added `--backend sdl` to `tools/runtime/house_actions.py`.

Open follow-ups:
- With the game running, verify `advance-day` and `take-inside` succeed (save deltas + in-game visible effects).
- If it works: migrate other click-based scripts (menu entry flow) to use SDL backend to avoid Win32 cursor restrictions entirely.

Evidence:
- `mod/一键整合包-v1.1/.tmp_data/sdl_dynapi_stub_addrs_rz_20260225.txt`
- `mod/一键整合包-v1.1/tools/runtime/sdl_frida_agent.js`
- `mod/一键整合包-v1.1/tools/runtime/sdl_frida_input.py`
- `mod/一键整合包-v1.1/tools/runtime/house_actions.py`
- `mod/一键整合包-v1.1/tools/runtime/ui_automation.py`
- `mod/一键整合包-v1.1/tools/runtime/README_UI_AUTOMATION.md`

### 2026-02-25 - Input pipeline RE: Raw Input handler + helpers extracted
Summary:
- Expanded static RE on input subsystem to identify the Raw Input message handler and the first layer of input-state helper functions.

Completed:
- Captured `WM_INPUT`/`WM_INPUT_DEVICE_CHANGE` handler around `GetRawInputData` and dispatch into `fcn.140c63f60`.
- Extracted helper functions called by `fcn.140c63f60` that update state and emit dispatcher events (`fcn.140bafc20`).
- Captured xrefs + body of `fcn.140bafc20` for tracing the event consumer(s) next.
- Continued tracing the dispatch chain down to the actual event-queue insertion:
  - `fcn.140bafc20 -> fcn.140bafad0 -> fcn.140baf8e0 -> fcn.140badcb0`
  - confirmed event struct copy size `0x80` bytes and queue-node size `0x98`.
- Located the queue-level consumer primitives:
  - remove event node (`fcn.140badfa0`)
  - callback-based queue iteration+pruning (`fcn.140bae140`)
  - flush-by-type (`fcn.140bae1d0`)
  - and the enqueue callsite in `fcn.140c29360` (calls `fcn.140bafc20`).

Evidence:
- `mod/一键整合包-v1.1/.tmp_data/input_wndproc_rawinput_rz_20260225.txt`
- `mod/一键整合包-v1.1/.tmp_data/input_pipeline_rz_extract_20260225_v2.txt`
- `mod/一键整合包-v1.1/.tmp_data/input_pipeline_rz_helpers_20260225.txt`
- `mod/一键整合包-v1.1/.tmp_data/input_dispatcher_bafc20_rz_20260225.txt`
- `mod/一键整合包-v1.1/.tmp_data/input_dispatcher_bafad0_rz_20260225.txt`
- `mod/一键整合包-v1.1/.tmp_data/input_dispatcher_baf8e0_rz_20260225.txt`
- `mod/一键整合包-v1.1/.tmp_data/input_dispatcher_badcb0_rz_20260225.txt`
- `mod/一键整合包-v1.1/.tmp_data/input_event_queue_globals_xrefs_20260225.txt`
- `mod/一键整合包-v1.1/.tmp_data/input_event_queue_candidates_pdf_20260225.txt`
- `mod/一键整合包-v1.1/.tmp_data/input_event_pump_c29360_rz_20260225.txt`
- `mod/一键整合包-v1.1/.tmp_data/input_event_queue_pop_probe_20260225.txt`

### 2026-02-25 - Save-write room rehome tool added (no cursor injection)
Summary:
- Implemented a strategy-driven rehome tool that rewrites `files.house_state` so the active house roster can be re-assigned between rooms without manual UI dragging/clicking.

Completed:
- Added `tools/runtime/rehome_house_rooms.py` (dry-run by default; `--apply` writes with backup).
- Documented usage in `tools/runtime/README_DATA.md`.

Open follow-ups:
- Confirm in-game behavior after applying: whether room reassignment reflects immediately or requires reload/scene transition.
- If validated, add a watch-loop mode (re-apply after each day increment) to approximate in-game mod behavior.

Evidence:
- `mod/一键整合包-v1.1/tools/runtime/rehome_house_rooms.py`
- `mod/一键整合包-v1.1/tools/runtime/README_DATA.md`

### 2026-02-25 - Runtime script review: pipeline auto fallback hardened
Summary:
- Reviewed runtime data/strategy scripts for consistency and failure modes.
- Confirmed data-only path remains stable (241/241 cats with 7 `base_stats`; MCTS depth=5 produces `best_branch_len=5`).

Completed:
- Fixed `run_cattery_pipeline.py` auto mode to not crash when click injection fails; it now logs and falls back to the next strategy (keyboard/mouse).
- Re-compiled the updated script (`py_compile`) successfully.

Open follow-ups:
- Consider loosening `watch_save_state._best_stat_window` total-range heuristic (currently filters totals >90) for future higher-stat saves/modded ranges.
- Add retry/backoff around SQLite reads when the game is writing (avoid transient lock/partial read errors).

Evidence:
- `mod/一键整合包-v1.1/tools/runtime/run_cattery_pipeline.py:348`
- `mod/一键整合包-v1.1/tools/runtime/run_cattery_pipeline.py:397`
- `mod/一键整合包-v1.1/tools/runtime/watch_save_state.py:341`
- `mod/一键整合包-v1.1/tools/runtime/build_cattery_strategy.py:304`
- `mod/一键整合包-v1.1/.tmp_data/cattery_data_latest.json`
- `mod/一键整合包-v1.1/.tmp_data/cattery_strategy_latest.json`

### 2026-02-25 - Direct full-cattery stat decode achieved (no per-cat switching)
Summary:
- Solved direct full-state extraction requirement by decoding `cats.data` LZ4 payload.
- Planner no longer depends on manual stat typing for normal flow.

Completed:
- Added `decode_cat_blob` + `decode_cat_record` in runtime data pipeline.
- Updated `watch_save_state.py` snapshot output to include `level_guess` + `base_stats`.
- Updated `export_cattery_data.py` to emit decoded `base_stats` for each cat.
- Verified current save: `241/241` cats have `base_stats`.
- Updated planner UI to consume `base_stats` from export (with manual/auto override fallback).
- Added `build_cattery_strategy.py` + `strategy_settings.json` for room grouping and strategy output generation.

Open follow-ups:
- Implement room semantic classification for breeder/combat grouping.
- Add strategy layer (MCTS-lite or equivalent) over decoded full state.
- Connect strategy outputs to automation when input injection is reliable.

Evidence:
- `mod/一键整合包-v1.1/tools/runtime/watch_save_state.py:296`
- `mod/一键整合包-v1.1/tools/runtime/watch_save_state.py:378`
- `mod/一键整合包-v1.1/tools/runtime/export_cattery_data.py:74`
- `mod/一键整合包-v1.1/tools/runtime/all7_planner_ui.py:206`
- `mod/一键整合包-v1.1/.tmp_data/cattery_data_latest.json:14`
- `mod/一键整合包-v1.1/.tmp_data/cattery_data_latest.json:452`

### 2026-02-25 - MCTS depth-5 branch planning enabled
Summary:
- Upgraded strategy engine from greedy-only to MCTS branch search for all-7 objective.

Completed:
- Added MCTS parameters and runtime in `build_cattery_strategy.py`.
- Set default strategy config to `search_mode=mcts` with depth 5.
- Generated strategy artifact with 5-step best branch and non-empty score.

Open follow-ups:
- Improve room-role configuration so MCTS pool focuses on true breeder rooms.
- Add stronger rollout/evaluation policy aligned with multi-generation constraints.
- Bridge MCTS action outputs to execution layer once input automation is stable.

Evidence:
- `mod/一键整合包-v1.1/tools/runtime/build_cattery_strategy.py`
- `mod/一键整合包-v1.1/tools/runtime/strategy_settings.json`
- `mod/一键整合包-v1.1/.tmp_data/cattery_strategy_latest.json`

### 2026-02-25 - Pivot to decision UI; input injection capability audited
Summary:
- Shifted immediate priority from menu-entry clicking to all-7 decision support UI.
- Confirmed current environment cannot reliably move cursor for automation clicks.

Completed:
- Added `tools/runtime/all7_planner_ui.py` (manual 7-stat input + pair ranking).
- Added planner usage section to `tools/runtime/README_DATA.md`.
- Added cursor-injection guard path in `tools/runtime/ui_automation.py` to surface non-authoritative click path.
- Wrote `input_injection_probe_latest.json` evidence artifact.

Open follow-ups:
- Validate planner flow with your real in-game stat inputs for selected breeders.
- Resume click automation only after solving input injection constraints.
- Replace manual stats with automatic save decode once base-stat fields are mapped.

Evidence:
- `mod/一键整合包-v1.1/tools/runtime/all7_planner_ui.py:309`
- `mod/一键整合包-v1.1/tools/runtime/README_DATA.md:34`
- `mod/一键整合包-v1.1/tools/runtime/ui_automation.py:337`
- `mod/一键整合包-v1.1/tools/runtime/ui_automation.py:374`
- `mod/一键整合包-v1.1/.tmp_data/input_injection_probe_latest.json:21`
- `mod/一键整合包-v1.1/.tmp_data/input_injection_probe_latest.json:26`
- `mod/一键整合包-v1.1/.tmp_data/input_injection_probe_latest.json:27`

### 2026-02-24 - Runtime automation audit: entered verification stage, blocked on house actions
Summary:
- Confirmed previous work had already crossed from script drafting into executable verification runs.
- Located current hard blocker: house-scene action probes are running but not producing save/state deltas.

Completed:
- Verified Stage-1 cattery pipeline run with menu-exit gate and keyboard strategy.
- Verified newest house probes (`take_inside` + `advance_day`) were executed and persisted JSON evidence.
- Confirmed both house actions currently fail verification (`success=false`, unchanged save fingerprints).

Open follow-ups:
- Determine whether failure is point calibration, scene/focus mismatch, or action precondition mismatch.
- Produce first passing `take_inside` and `advance_day` evidence pair.

Evidence:
- `mod/一键整合包-v1.1/.tmp_data/cattery_stage1_kb3.json:8`
- `mod/一键整合包-v1.1/.tmp_data/cattery_stage1_kb3.json:9`
- `mod/一键整合包-v1.1/.tmp_data/house_take_inside_latest.json:4`
- `mod/一键整合包-v1.1/.tmp_data/house_take_inside_latest.json:117`
- `mod/一键整合包-v1.1/.tmp_data/house_advance_day_latest.json:4`
- `mod/一键整合包-v1.1/.tmp_data/house_advance_day_latest.json:26`
- `mod/一键整合包-v1.1/.tmp_data/house_advance_day_latest.json:27`

### 2026-02-26 - SDL point capture workflow to unblock house MVP
Summary:
- Confirmed SDL injection events are consumed by the game's SDL_PollEvent loop (not just "sent successfully").
- Identified the remaining blocker as point calibration mismatch (not injection transport).
- Added a single-command SDL point recorder for the 3 house MVP points.

Completed:
- Captured pollprobe evidence showing injected mouse motion/down/up events being returned by SDL_PollEvent:
  - `mod/一键整合包-v1.1/.tmp_data/sdl_pollprobe_latest.json`
- Added SDL-backed point recorder:
  - `mod/一键整合包-v1.1/tools/runtime/record_house_mvp_points.py --backend sdl`
- Updated UI automation docs with the new one-command SDL recorder:
  - `mod/一键整合包-v1.1/tools/runtime/README_UI_AUTOMATION.md`

Open follow-ups:
- Re-record `house_take_inside`, `house_next_day`, `house_interstitial_continue` in the house scene.
- Re-run:
  - `python tools/runtime/house_actions.py advance-day --backend sdl-warp --no-focus`
  - Acceptance: `current_day` increments and save fingerprint changes.
- If still failing after fresh points:
  - Add a window capture before/after click to confirm coordinates are hitting UI, then revisit event struct layout vs SDL3 ABI.

### 2026-02-26 - MewLoader extraction: confirmed deploy-only mod pipeline (no injection)
Summary:
- Extracted `MewLoader.exe` PyInstaller archive and inspected the packaged Python modules.
- Confirmed the loader is a disk-file deployer (manifested cleanup + `.gon.patch` deep-merge + `.csv.append` key-override merge), not a runtime injector / RE hook.

Completed:
- Extracted archive to:
  - `mod/模组加载器v1.2/.tmp_extract/MewLoader.exe_extracted`
- Captured a stable import/keyword scan for `core/*` + `ui/*`:
  - no `OpenProcess`/`WriteProcessMemory`/`CreateRemoteThread` style strings or modules
- Captured docstring evidence of patch semantics:
  - `deep_merge_gon` + `_merge_csv_append` + `detect_conflicts` rules

Next:
- If we want “trigger next day by function call”, this needs a separate runtime RE path (Frida / rizin); MewLoader does not provide that layer.
- If we want a safe “data-mod” breeding UX, use MewLoader-compatible outputs:
  - generate `.gon.patch` / `.csv.append` and deploy via manifest (no save sqlite edits).

Evidence:
- `mod/模组加载器v1.2/.tmp_data/mewloader_pyc_scan_20260226_120451_utf8.txt:1`
- `mod/模组加载器v1.2/.tmp_data/mewloader_key_doc_20260226_120852.txt:1`
- `.mewloader_manifest.json:1`

### 2026-02-26 - Native End Day trigger via Frida (function call; pre-verification)
Summary:
- Located a strong static call chain for "End Day / Next Day" transition scheduling.
- Implemented a native trigger backend that calls the game's End Day gate (`fcn.1401eb410`) from the SDL event-loop thread (via `SDL_PollEvent` hook), avoiding coordinate clicks for the primary day-advance action.
- Wired this into `house_actions.py --backend native`, with fallback to an SDL click when native dispatch cannot cache the EndDay sign pointer yet.

Completed:
- Added EndDay pointer caching hooks + RPC exports to `tools/runtime/sdl_frida_agent.js` (`endday_request/endday_state`).
- Added `endday-state` + `endday` CLI commands and `SDLFridaInjector.endday_trigger()` to `tools/runtime/sdl_frida_input.py`.
- Added `--backend native` to `tools/runtime/house_actions.py` and mapped `house_next_day` to the native trigger (fallback to SDL click).

Open follow-ups:
- With the game running in the house scene, run:
  - `python tools/runtime/house_actions.py advance-day --backend native --no-focus`
  - Acceptance: `current_day` increments and save fingerprint changes.
- Confirm interstitial advance/close:
  - If day increment stalls on interstitial, keep using `house_interstitial_continue` (SDL click) while runtime RE maps a direct continue function.

Evidence:
- `mod/一键整合包-v1.1/.tmp_data/passday_callers_fns_rz_20260226_125211.txt:777`
- `mod/一键整合包-v1.1/.tmp_data/passday_callers_fns_rz_20260226_125211.txt:798`
- `mod/一键整合包-v1.1/.tmp_data/passday_pd_nocolor_rz_20260226_131140.txt:97`
- `mod/一键整合包-v1.1/.tmp_data/passday_pd_nocolor_rz_20260226_131140.txt:119`
- `mod/一键整合包-v1.1/.tmp_data/endday_fns_rz_20260226_123458.txt:636`
- `mod/一键整合包-v1.1/tools/runtime/sdl_frida_agent.js`
- `mod/一键整合包-v1.1/tools/runtime/sdl_frida_input.py`
- `mod/一键整合包-v1.1/tools/runtime/house_actions.py`

### 2026-02-26 - Compatibility priors: community rules -> runtime evidence plan
Summary:
- Clarified that community knowledge about sexuality/sex '?' can be used as priors, but needs in-engine logging before we treat it as Confirmed.

Completed:
- Updated open question 6.1 with an explicit extraction plan and acceptance check for decoding compatibility + sex/sexuality semantics.

Evidence:
- `mod/一键整合包-v1.1/.tmp_data/breeding_mechanics_extracted_v3.md`

### 2026-02-26 - Action execution strategy: minimize UI by save-write + native triggers
Summary:
- Clarified the preferred action stack for performance/stability:
  - native function calls where possible (End Day),
  - save-write for room rehome when acceptable (no dragging),
  - SDL UI injection only as fallback.

### 2026-02-26 - Save-write poop cleanup (no clicking)
Summary:
- Implemented poop cleanup by deleting `furniture` rows whose object name is `poop`, with combat-room exclusion by default.

Completed:
- Added `tools/runtime/clean_house_poop.py` with `--dry-run/--apply` + backup + room exclusion:
  - settings-based combat rooms
  - optional auto-detect combat rooms from poop density (`--auto-combat-from-poop`)
- Wired an optional stage into `run_strategy_pipeline.py` (`--clean-poop` / `--apply-clean-poop`).

Evidence:
- `mod/一键整合包-v1.1/tools/runtime/clean_house_poop.py`
- `mod/一键整合包-v1.1/tools/runtime/run_strategy_pipeline.py`
- `mod/一键整合包-v1.1/.tmp_data/house_poop_clean_plan_latest.json`

### 2026-02-26 - Save snapshot + diff utilities for field decoding
Summary:
- Added save snapshot + diff tooling to quickly discover which save fields change for actions like day-advance and cat handoff.

Completed:
- Added `tools/runtime/snapshot_save.py` to create timestamped `.sav` snapshots under `.tmp_data/snapshots/`.
- Added `tools/runtime/diff_saves.py` to summarize table/key-level diffs across two saves.
- Added `tools/runtime/analyze_cat_blob_deltas.py` to rank per-cat blob offsets that change across many records (candidate daily fields).

Evidence:
- `mod/一键整合包-v1.1/tools/runtime/snapshot_save.py`
- `mod/一键整合包-v1.1/tools/runtime/diff_saves.py`
- `mod/一键整合包-v1.1/tools/runtime/analyze_cat_blob_deltas.py`

### 2026-02-26 - Interactive capture wizard for save deltas
Summary:
- Added a step-by-step `.bat` wizard to snapshot BEFORE/AFTER around manual in-game actions, then auto-run diff + cat blob delta analysis.

Completed:
- Implemented `mod/test/capture_save_deltas.bat` with staged prompts:
  - advance day + open cattery + save
  - optional NPC cat handoff stages: Butch / Tink / Jack / Beanies / Tracy / Organ Grinder

Evidence:
- `mod/test/capture_save_deltas.bat`

### 2026-02-27 - npc_progress parsing + learned gift recipe (save-write)
Summary:
- Implemented best-effort parsing + diffing of `files.npc_progress` so byte-level changes can be mapped to record keys.
- From captured NPC handoff snapshots, confirmed the minimal save-write closure for “gift cat” is:
  - `files.house_state`: remove target `cat_id` from active roster.
  - `cats.data` (decoded): set a per-NPC flag bit in an early header field whose byte offset is **name-length anchored**:
    - `name_len` is `u32` at decoded offset `+12` (UTF-16LE name length in chars).
    - Observed gifted-flag bytes use `off = base + (2 * name_len)` where `base` varies by NPC.
  - `files.npc_progress`: increment a key-specific counter (`payload u32[0] += 1`) for the NPC.

Observed examples (all `u32[0] += 1`):
- `gift_butch` (`mod/test/logs/20260227-010625/`):
  - removed `cat_id=299`
  - cat flag: `base=37`, `set_mask=0x10`
  - npc_progress key: `upgrade_storage_3`
  - note: same capture also moved one non-target cat `HousePipe -> Floor1_Large` (likely incidental UI-state)
- `gift_jack` (`mod/test/logs/20260227-010625/`):
  - removed `cat_id=330`
  - cat flag: `base=38`, `set_mask=0x02`
  - npc_progress key: `jack_shopupgrade3`
  - note: same capture also moved one non-target cat `HousePipe -> ""` (likely incidental UI-state)
- `gift_organgrinder` (`mod/test/logs/20260227-010625/`):
  - removed `cat_id=344`
  - cat flag: `base=37`, `set_mask=0x80`
  - npc_progress key: `organ_upgrade4`

Non-findings:
- `gift_tink` captured diff was 0 (no eligible kitten to hand off).
- `gift_tracy` capture was contaminated (included `house_food +100` and structural `npc_progress` changes); do not treat as a clean “gift-only” recipe.
- Added a recipe workflow so one captured handoff can be replicated for other cats:
  - `tools/runtime/learn_gift_recipe.py` produces `gift_recipe_*.json`
  - `tools/runtime/apply_gift_recipe.py` applies the recipe to a chosen `cat_id` (dry-run by default; backup on apply).

Evidence:
- `mod/test/logs/20260226-234604/diff_gift_butch.json`
- `mod/test/logs/20260226-234604/cat_deltas_gift_butch.txt`
- `mod/test/logs/20260226-234604/gift_recipe_butch.json`
- `mod/test/logs/20260227-010625/diff_gift_butch.json`
- `mod/test/logs/20260227-010625/diff_gift_jack.json`
- `mod/test/logs/20260227-010625/diff_gift_organgrinder.json`
- `mod/test/logs/20260227-010625/cat_deltas_gift_butch.txt`
- `mod/test/logs/20260227-010625/cat_deltas_gift_jack.txt`
- `mod/test/logs/20260227-010625/cat_deltas_gift_organgrinder.txt`
- `mod/test/logs/20260227-010625/npc_progress_deltas_gift_butch.txt`
- `mod/test/logs/20260227-010625/npc_progress_deltas_gift_jack.txt`
- `mod/test/logs/20260227-010625/npc_progress_deltas_gift_organgrinder.txt`
- `mod/test/logs/20260227-010625/gift_recipe_butch.json`
- `mod/test/logs/20260227-010625/gift_recipe_jack.json`
- `mod/test/logs/20260227-010625/gift_recipe_organgrinder.json`
- `mod/一键整合包-v1.1/tools/runtime/npc_progress.py`
- `mod/一键整合包-v1.1/tools/runtime/diff_npc_progress.py`
- `mod/一键整合包-v1.1/tools/runtime/learn_gift_recipe.py`
- `mod/一键整合包-v1.1/tools/runtime/apply_gift_recipe.py`

Addendum:
- Clarified room “classification” semantics for save-write tools:
  - `room_roles` is the single configuration pivot for “which rooms are breeders vs combat” in both strategy and rehome.
  - Rehome assignment preserves room counts and only swaps which cats occupy each room’s existing slots.
- Evidence:
  - `mod/一键整合包-v1.1/tools/runtime/strategy_settings.json:1`
  - `mod/一键整合包-v1.1/tools/runtime/rehome_house_rooms.py:237`

### 2026-02-27 - Decode fertility + litter probabilities (data-only)
Summary:
- Decoded `fertility` (CatData `+0xbf0`, inferred save-side mapping) from cats blob hidden segment.
- Implemented litter roll distribution (p0/p1/p2, expected) and surfaced it in the breeding compatibility report.
- Wired `{litter_product,p_kitten_ge1,expected_litter}` into strategy pair outputs for downstream planners.

Evidence:
- `mod/一键整合包-v1.1/.tmp_data/fcn_1401e47e0_clean.txt:1699`
- `mod/一键整合包-v1.1/.tmp_data/fcn_1401e47e0_clean.txt:1705`
- `mod/一键整合包-v1.1/tools/runtime/watch_save_state.py:429`
- `mod/一键整合包-v1.1/tools/runtime/breeding_compat.py:158`
- `mod/一键整合包-v1.1/tools/runtime/report_breeding_compat.py:83`
- `mod/一键整合包-v1.1/tools/runtime/build_cattery_strategy.py:355`

### 2026-02-27 - Room effects + auto room role inference (data-only)
Summary:
- Implemented per-room Comfort/Stimulation/etc computation from save furniture placement + `furniture_effects.gon`.
- Added `--auto-room-roles` so strategy + rehome can adapt to different save layouts (single-room houses, no combat room, etc.).
- Captured a save-slot1 day-advance before/after snapshot pair to validate diffs and cat roster changes.

Evidence:
- `mod/一键整合包-v1.1/tools/runtime/room_effects.py`
- `mod/一键整合包-v1.1/tools/runtime/report_room_effects.py`
- `mod/一键整合包-v1.1/tools/runtime/run_strategy_pipeline.py`
- `mod/一键整合包-v1.1/.tmp_data/snapshots/steamcampaign01_baseline_20260227-210332.sav`
- `mod/一键整合包-v1.1/.tmp_data/snapshots/steamcampaign01_dayadvance_after_20260227-210758.sav`

### 2026-02-24 - Breeding model hardening and tracker bootstrap
Summary:
- Elevated breeding model from partial hypothesis to code-backed weighted inheritance model.
- Created this tracker as persistent module ledger for future sessions.

Completed:
- Mapped call chain:
  - `fcn.1401e47e0 -> fcn.1400d5880 -> fcn.1400a5ba0 -> fcn.1400a4920`
- Confirmed per-stat weighted parent selection logic.
- Confirmed seven stat inheritance writes by offsets `+0x6f0..+0x708`.
- Confirmed fertility product branch and result paths.
- Consolidated extraction notes in:
  - `.tmp_data/breeding_mechanics_extracted_v3.md`

Open follow-ups:
- Decode exact compatibility/rejection equation.
- Build M2 realtime capture proof-of-concept.


### 2026-02-24 - Skill bootstrap completed
Summary:
- Created and validated mewgenics-ai-lab skill with persistent module tracker

Completed:
- Initialized skill skeleton via skill-creator init_skill.py
- Filled SKILL.md with workflow and evidence policy
- Created references/module-tracker.md baseline
- Added scripts/add_session_note.py
- Validated with quick_validate.py

Next:
- Start M2 realtime state capture design
- Decide memory vs savefile vs UI pipeline

Evidence:
- F:/xiangmu/speckit/.codex/skills/mewgenics-ai-lab/SKILL.md
- F:/xiangmu/speckit/.codex/skills/mewgenics-ai-lab/references/module-tracker.md
- F:/xiangmu/speckit/.codex/skills/mewgenics-ai-lab/scripts/add_session_note.py

### 2026-02-24 - Realtime save-state PoC
Summary:
- Implemented live SQLite save watcher for key game state

Completed:
- Confirmed steamcampaign .sav is SQLite format
- Mapped save source to AppData/Roaming/Glaiel Games/Mewgenics/<steamid>/saves
- Added tools/runtime/watch_save_state.py
- Validated snapshot read and Python compile

Next:
- Add robust cat parser for full 7 stats from cats blob
- Add event stream output for MCTS consumer

Evidence:
- f:/SteamLibrary/steamapps/common/Mewgenics/mod/一键整合包-v1.1/tools/runtime/watch_save_state.py
- C:/Users/Administrator/AppData/Roaming/Glaiel Games/Mewgenics/76561198833287215/saves/steamcampaign01.sav

### 2026-02-24 - Runtime cat summary upgrade
Summary:
- Extended live save watcher to output structured cat combat profile tokens

Completed:
- Added core_kit extraction from Basic* token
- Added trait_tokens and ability_tokens extraction
- Kept existing global state and counts outputs

Next:
- Map token patterns to canonical class/ability IDs
- Decode true 7 base stat fields from cats blob

Evidence:
- f:/SteamLibrary/steamapps/common/Mewgenics/mod/一键整合包-v1.1/tools/runtime/watch_save_state.py

### 2026-02-28 - Room roles + Stimulation inheritance integration
Summary:
- Pulled community/RE signals into the data-only pipeline: derive p_better from breeder-room Stimulation, improve room role inference using fight signals/breeding suppression/crowding estimate, and let poop-cleaner auto-exclude combat rooms from effects.

Completed:
- export: attach active cat count + comfort_with_crowding_est into room_effects
- room_roles: prefer FightBonusRewards/FightRisk + BreedSuppression, fallback to poop density
- strategy: default MCTS depth=7 and add use_room_stimulation_for_p_best
- poop cleanup: add --auto-combat-from-effects

Issues:
- Compatibility/attraction reject equation still unknown; planner remains optimistic

Next:
- Decode attraction/compatibility inputs from cats.data (snapshot-diff + instrumentation)
- Validate crowding->comfort penalty and breeding gate thresholds in-engine

Evidence:
- SciresM gist (breeding + stimulation odds): https://gist.github.com/SciresM/95a9dbba22937420e75d4da617af1397
- mod/模组加载器v1.2/_internal/base_data/data/furniture_effects.gon
- mod/一键整合包-v1.1/tools/runtime/build_cattery_strategy.py
- mod/一键整合包-v1.1/tools/runtime/room_effects.py
- mod/一键整合包-v1.1/tools/runtime/clean_house_poop.py

### 2026-02-28 - Compatibility gate: no_breed flag bit mapping
Summary:
- Identified the `+0xbf8` bit-21 gate in `fcn.1400cf880` as the `"no_breed"` catdata property (bit `0x200000`), used by some special strays.

Completed:
- Updated tracker (**4.38**, **6.1**) and the data-only model hard-rejects `no_breed`/dead/retired/donated cats when computing attraction.

Next:
- Decode/confirm `fcn.1400d0210` semantics (availability) and check if any hater/aggression multiplier exists outside `fcn.1400cf880`.

Evidence:
- mod/一键整合包-v1.1/.tmp_data/fcn_1400cf880_plain.txt:25
- mod/一键整合包-v1.1/.tmp_data/fcn_1400a7300_clean.txt:485
- mod/模组加载器v1.2/_internal/base_data/data/special_strays.gon:41
- mod/一键整合包-v1.1/tools/runtime/breeding_compat.py

### 2026-02-28 - Pipeline: integrate corpse gift stage (data-only)
Summary:
- `run_strategy_pipeline.py` now supports `--gift-dead/--apply-gift-dead` to run `gift_dead_cats_organgrinder.py` before export/strategy, so one command can handle daytime corpse handoff + room fixes.

Completed:
- Added flags, updated pipeline docstring, and updated the printed one-liner apply command.

Evidence:
- mod/一键整合包-v1.1/tools/runtime/run_strategy_pipeline.py
- mod/一键整合包-v1.1/tools/runtime/gift_dead_cats_organgrinder.py

### 2026-02-28 - Save-write safety: unique backup names (fix overwrite bug)
Summary:
- Found that multiple apply stages in one pipeline run could create the same `.bak-YYYYMMDD-HHMMSS` name and overwrite backups.
- Updated save-write tools to generate unique backup filenames (microsecond timestamp + collision suffix).

Completed:
- Added `backup_utils.backup_save_unique()` and wired it into all save-write scripts.

Evidence:
- mod/一键整合包-v1.1/tools/runtime/backup_utils.py
- mod/一键整合包-v1.1/tools/runtime/gift_dead_cats_organgrinder.py
- mod/一键整合包-v1.1/tools/runtime/rehome_house_rooms.py
- mod/一键整合包-v1.1/tools/runtime/clean_house_poop.py
- mod/一键整合包-v1.1/tools/runtime/apply_gift_recipe.py

### 2026-02-28 - One-click housekeeping: visible room classification (repartition rehome)
Summary:
- Fixed the "BAT seems to only clean poop / cats not classified" mismatch by adding a real role-based room repartition mode.

Completed:
- `tools/runtime/rehome_house_rooms.py`: add `--repartition` + `--breeder-room-cap` (default 4) to actually change per-room cat counts; filters unknown rooms and avoids leaving blank `room==""` behind; adds deterministic position jitter for packed rooms.
- `tools/runtime/run_strategy_pipeline.py`: pass through `--repartition` options to the rehome step.
- `mod/一键整合包-v1.1/一键整理.bat`: enable `--repartition` by default; poop cleaning excludes combat rooms via `--auto-combat-from-effects` (safe default).

Evidence:
- mod/一键整合包-v1.1/tools/runtime/rehome_house_rooms.py
- mod/一键整合包-v1.1/tools/runtime/run_strategy_pipeline.py
- mod/一键整合包-v1.1/一键整理.bat
- mod/一键整合包-v1.1/.tmp_data/house_rehome_plan_latest.json

### 2026-03-01 - Breeding-first rules: community-aligned cleanup + ditto support
Summary:
- Focused on "avoid not breeding" as the primary objective: keep breeder rooms comfortable and lightly populated, and pack the best viable opposite-sex pairs into breeder rooms.

Completed:
- `tools/runtime/build_cattery_strategy.py`: treat neutral/ditto sex as both sides for pair search (and avoid self-pair when neutral is included).
- `tools/runtime/rehome_house_rooms.py`: fixed `p0==0` handling so `p_kitten_ge1` is computed correctly when twins are possible; breeding-mode `--repartition` keeps best pairs in breeder rooms instead of flushing them.
- `tools/runtime/run_strategy_pipeline.py`: run poop cleaning before export/strategy (so Comfort reflects post-clean state), and refresh export+strategy after applying rehome so outputs match the final room assignment.
- `mod/一键整合包-v1.1/一键整理.bat`: default poop cleaning excludes combat rooms again (`--auto-combat-from-effects`), avoiding "Attic got cleaned" surprise.

Community alignment (Inferred):
- Comfort/room conditions gate breeding success; keeping rooms clean and not overcrowded is the mainstream play pattern.

Evidence:
- mod/一键整合包-v1.1/tools/runtime/build_cattery_strategy.py
- mod/一键整合包-v1.1/tools/runtime/rehome_house_rooms.py
- mod/一键整合包-v1.1/tools/runtime/run_strategy_pipeline.py
- mod/一键整合包-v1.1/一键整理.bat

### 2026-03-02 - One-click pipeline stability: MCTS virtual-cat ID crash fix (verified)
Summary:
- Fixed a crash in `build_cattery_strategy.py` when MCTS introduced virtual cats with string IDs (`vm*`/`vf*`) and the action-space builder tried to `int()`-cast IDs for the self-pair check.

Completed:
- `tools/runtime/build_cattery_strategy.py`: compare IDs as strings for self-pair avoidance (no int-cast).
- Verified `mod/一键整合包-v1.1/一键整理.bat` runs end-to-end without crashing and applies repartition rehome + combat-room poop exclusion.

Evidence:
- mod/一键整合包-v1.1/tools/runtime/build_cattery_strategy.py
- mod/一键整合包-v1.1/tools/runtime/run_strategy_pipeline.py
- mod/一键整合包-v1.1/一键整理.bat
