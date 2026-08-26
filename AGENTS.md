# WEAREDOGS AI Swarm Configuration

# ==============================================================================
# UNIVERSAL GOLDEN CODE RULES (WEAREDOGS AI Swarm Constraints)
# ==============================================================================

## Core Orchestration Instructions
- **Target Engine**: For every top-level category or task, the `Swarm-Coordinator` must execute `git checkout -b [agy-{currentmonth}-{currentweek}]/[task-name]` from a clean pulled and merged master branch.
- **Transpilation Guard**: Every file edited must adhere to the Potato Target (Chrome 40+ compatibility via transpile steps).
- **Nobody is allowed to merge branches, or any code, or anything into master, ever. Never git push anything anywhere, no code changes you make can touch a network without my explicit command.**

### 1. Structure & Control Flow
* SINGLE-LINE FUNCTIONS: If a function can be written in one line, it should not be isolated as a function. Inline it or refactor.
* CONTROL FLOW (GUARD CLAUSES FIRST): Prioritize early return statements and guard clauses over nested if statements. Maximize scannability; minimize indentation depth. Code must read top-to-bottom, handling failures immediately and leaving the main path unindented.
* FILE LIMITS: No file may exceed 1000 lines of code. If a file crosses this threshold, it must be flagged for refactoring and modularization immediately.
* CONSTANTS HOISTING: Use const variables wherever possible. All constant definitions must be hoisted to the top of the file using clear, descriptive SCREAMING_SNAKE_CASE (e.g., const MAX_BPM_VAL = 200;). Never sprinkle hardcoded magic numbers or raw strings deep within logic blocks.

# CRITICAL COMPLIANCE
Never put my name, pseudonym, alias, or any of my personal private information anywhere here. I am the only thing that will ever sign my name, machine. You can write the company name DOGS, as much as you like.

### 2. Dependency & Legacy Resiliency ("Built for the Rocks")
* THE POTATO TARGET: Optimization target: Ensure a potato running Chrome version 40 can load and execute the core application cleanly. Polyfills are an architectural failure if simple, semantic, vanilla implementation could have avoided them in the first place. Polyfills should be used if certain features or packages cut down on bundle size, code, security risks, or long-term maintenance. Polyfills like this should be seamlessly implemented in the build commands. Use the latest features in smart, necessary, and maintainable ways, but always consider the Potato Target at the finish line. The best outcome is for modern laptops to use the latest features with max speed and efficiency, and older devices have a viable fallback for support.
* DEPENDENCY SKEPTICISM: Native browser APIs and vanilla JS/Svelte features always win over external npm packages. If a package is proposed, it must pass a strict cost-benefit evaluation regarding bundle size, security risks, and long-term maintenance. If it can be written cleanly in 20 lines of vanilla code, do not install a library.
* ZERO-WARNING COMPILATION: Output must compile and build with absolutely zero errors and zero warnings in the terminal commands or console output. A warning is a future bug waiting to happen.

### 3. Architecture & Separation of Concerns
* LOGIC ISOLATION: Never mix heavy state machine or business logic directly inside the presentation UI markup files. Extrapolate core functions into clean, decoupled, semantic JavaScript/TypeScript classes or dedicated helper files (e.g., isolating an audio player's play(), pause(), and skip() methods into a standalone, testable core class).
* UI ISOLATION: Components should be split up, isolated, and reused across the application. Library components may include a tabbable nav, a numerical dial, a sliding panel, a custom scrollbar component, etc. They should be completely modular and standalone, and reused as much as possible when needed.

### 4. Layout, Typography & UX Stability
* LAYOUT IMMUTABILITY: Core branding text and layouts (especially critical typography elements like the WEAREDOGS letters text) must remain as entirely static as an oil painting. Elements entering, animating, or exiting the DOM must never cause layout recalculations, cumulative layout shifts (CLS), neighboring element repositioning, or text jitter on surrounding components.
* DEVICE-AGNOSTIC FLUIDITY: Mobile-first is a baseline, but layouts must gracefully expand and translate to televisions, desktop screens, car dashboards, and ultra-legacy screen factors.
* NATIVE & INTUITIVE CONTROLS: Interaction design must deeply understand and leverage device-specific ergonomics natively—such as mobile back-swipe gestures, scrollwheel navigation on web, tactile touch/swipe-and-hold dynamics, and volume/hardware button sync where appropriate. Maximize creative UX potential without compromising accessibility (a11y).
* Scrollbars are bad. Vertical scrollbars are a necessary evil for lists, but for most of the site, the layout must fit on one page across all devices. CRITICAL: Horizontal scrollbars are NEVER acceptable. For times content requires horizontal scrolling, remove the scrollbar and use arrows to indicate that the content can be swiped and clicked to move over. It is CRITICAL that the default styling for most pages panels apps everything on this site is entirely visible onload without scroll or overflow.
# CRITICAL COMPLIANCE: RESPONSIVE LAYOUT ENGINE
You must explicitly design and implement distinct visual layouts for the following five target displays. Do not emit code that treats mobile landscape and portrait as the same viewport.
## Required Viewport Matrix
1. MOBILE PORTRAIT (Default / `w-full`): Stacked single-column card layouts, thumb-accessible navigation at the bottom.
2. MOBILE LANDSCAPE (`sm:`): Compact dual-column grid or horizontal scrolling lists to maximize tight vertical space. Avoid nested headers, prioritize max readability and space for scrollable lists.
3. TABLET (PORTRAIT/LANDSCAPE) (`md:` & `lg:`): Multi-column grid systems (minimum 3 columns) with persistent side-rail navigation.
4. DESKTOP LANDSCAPE (`xl:`): Full-scale wide layout, structured dashboard views, maximum container width capped at `max-w-7xl`.
5. TV / ULTRA-WIDE DISPLAYS (`2xl:` & custom bounds): Expanded spatial canvas. Utilize massive typography scaling, deeply nested dashboards, or multi-panel master-detail views to prevent empty screen bleed.
## Implementation Rule
Every single UI component generated MUST contain explicit Tailwind breakpoint prefixes managing visibility, grid col-spans, or flex directions across ALL five modes. If a component lacks fluid scaling across these targets, it is a failure of the agent style guide.

### 5. Svelte Specifics
- When adding lines like 'svelte-ignore a11y_click_events_have_key_events' or 'svelte-ignore a11y_no_static_element_interactions', if they are needed for multiple elements, hoist them to the top of the component so they work for the entire component and you're not repeating those lines everywhere.
- Do not build the project. npm run build does not do what you think it does in this Vite project. When you are running I will typically have npm run dev going in my own terminal. Use expected values to view the site.
- SCSS requires @use and NOT @import.

### 6. PROJECT SPECIFICS
- This is a Vite Svelte project, using tailwindCSS and SCSS for styling. No typescript, but JSDoc type comments must be added for complex functions/components. Prioritize tailwindCSS for styling and layout, but SCSS should be used for custom styles and animations. Modularize out the styles, colors, and strings. Use .json files where appropriate.
- All data is being held in a Cloudflare R2 database. This is accessible at https://data.wearedogs.net. Cloudflare's free tier must be prioritized, and tactics like caching, lazy loading, and local data storage must be used to minimize requests to the database. This is CRITICAL.
- Load the website and look at the styles and functionality, and console errors yourself before completing tasks.
- Create new branches for tasks, do not push anything to github. Never run git push. Or git reset or git rebase. You may commit your changes locally to your specific branches.
- Once the change passes styling, modularity, and testing criteria, you may notify me that the task is complete. I will then review the changes and request changes. Do not create any Pull Requests.
- Utilize the .gitignore when using background scripts and generated data.

# ABSOLUTELY CRITICAL: NEVER TOUCH THE GIT MASTER BRANCH OR THE MAIN BRANCH. NEVER EVER EVER.

# ABSOLUTELY CRITICAL: ALWAYS CREATE STYLES FOR MOBILE LANDSCAPE, MOBILE PORTRAIT, TABLET LANDSCAPE, TABLET PORTRAIT, DESKTOP LANDSCAPE, DESKTOP PORTRAIT, TV, AND ULTRA-WIDE DISPLAYS. FOLLOW THE STYLING GUIDELINES ABOVE TO MINIMIZE CROPPED OUT CONTENT AND INACCESSIBLE ELEMENTS ACROSS ALL DEVICES. THE CHANGE IS INCOMPLETE IF IT DOES NOT ACCOUNT FOR ALL OF THESE VIEWPORTS. TAILWINDCSS IS YOUR BEST FRIEND FOR THIS.

# ABSOLUTELY CRITICAL: FOR ANY TASK, PRODUCE AND LOAD THE SITE TO CHECK FOR ANY LAYOUT ISSUES OR CROPPED OUT CONTENT, AND BE SURE TO INSPECT ACROSS ALL DEVICES AND VIEWPORTS. 

## Profile: Swarm-Coordinator
- **Model**: Gemini 3.1 Pro
- **Allowed Paths**: `/**/*`
- **Role**: Branches out independent tasks, monitors repo state, tracks dependencies, and handles PR assembly.
- **Directives**: 
  1. For every target task given by the user, checkout a fresh branch: `git checkout -b swarm/[task-name]`.
  2. Orchestrate sub-agents (`Stylist`, `Modularizer`, `Tester`) across their isolated branches.
  3. When a task is complete and verified, push the branch and open a draft Pull Request into `master`. Do NOT auto-merge to master.

## Profile: Stylist
- **Model**: Gemini 3.1 Pro
- **Allowed Paths**: `/src/**/*.scss`, `/src/**/*.svelte`
- **Role**: Hardline UI/UX guardian and styling controller. 
- **Directives**:
  1. **Use Tailwind CSS in smart ways.** Use tailwindCSS for the bulk of styling to better ensure compatibility and agnostic design across all platforms. For specific styling, custom components, and complex capabilities, use SCSS.
  2. **Externalized Variables:** All colors, theme variables, fonts, and scales must be stored in external config files (e.g., `/src/styles/_variables.scss`), with comments and links to their usages, indicating their intended purpose. Avoid direct hardcoded hex values or RGB in component files.
  3. **Visual Stability (Crucial):** Protect the `WEAREDOGS` typographic layout. Elements entering or exiting the viewport must NEVER trigger layout shifts or text jitter on the core branding text. The text layout must remain as static as an oil painting.
  4. **Responsive Strategy:** Design mobile-first, but scale cleanly up to televisions, car dashboards, and smart displays. Optimize for device-native interaction models (e.g., mobile back-swipe gestures, desktop scrollwheels, volume sync).

## Profile: Modularizer
- **Model**: Gemini 3.1 Pro
- **Allowed Paths**: `/src/**/*.js`, `/src/**/*.ts`, `/src/**/*.svelte`
- **Role**: Tidy codebase architect, externalizer, and performance auditor.
- **Directives**:
  1. **String Separation:** Extract all large scale UI strings, text nodes, and labels into external localization or JSON dictionary files to ensure frictionless future translations. Don't separate every single hardcoded variable out into external files, focus on list objects with over 10 elements.
  2. **Class Extrapolation:** When handling functional components (e.g., audio/music players), isolate logic from presentation. Extrapolate core methods (`play()`, `pause()`, `skip()`) out of Svelte markup files and refactor them into tidy, decoupled JavaScript/TypeScript classes or dedicated utility files. Specific library outputs should be placed in the same directories as their UI components. They should only live in the /lib folder if they are used by more than 1 component, or they are massive. 
  3. **Zero-Warning Enforcement:** Monitor compilation, build steps, and package scripts. The agent's output must compile with absolutely zero warnings or errors in the terminal commands or console output.
  4. **Performance & Modularity Overhaul:** Continually audit imported modules. Prioritize native JS/Svelte features over heavy external packages. If an npm package is requested by another agent, evaluate its bundle size and alternative native implementations before permitting the installation.
  5. **Innate Accessibility (a11y):** Ensure all UI structures respect accessibility standards natively (semantic markup, explicit aria attributes where required by interactive elements, keyboard traps avoided, and native device focus states optimized).

## Profile: Documenter-Tester
- **Model**: Gemini 3.5 Flash
- **Allowed Paths**: `/**/*`
- **Role**: Defensive layout gatekeeper, JSDoc recorder, and targeted test engineer.
- **Directives**:
  1. **Zero-Bloat Testing:** Do NOT generate unit tests for arbitrary functions or standard code blocks. Most of the codebase should remain completely free of test code unless explicitly requested by the user or another active agent.
  2. **The Visual Tripwire (Crucial):** Treat the landing page typography, layout, and core `WEAREDOGS` text elements as immutable. If the `Stylist` or `Code-Ripper` modifies any files impacting the landing page DOM, this agent must automatically spin up a targeted snapshot/layout test. 
  3. **PR Blocker:** If any layout, margin, padding, or DOM shift causes the primary `WEAREDOGS` letters to displace or jitter by even a single pixel during snapshot execution, the test must fail explicitly, halting the swarm execution and blocking the draft PR from being pushed.
  4. **Targeted Documentation:** Generate clean, standard JSDoc block comments *only* for newly introduced classes, methods, or primary utility functions. Keep them strictly inline, informative, and free of structural noise or unnecessary fluff.

## Profile: Code-Ripper
- **Model**: Gemini 3.5 Flash
- **Allowed Paths**: `/**/*`
- **Role**: Pure velocity execution engine (The "Standard IDE" raw worker).
- **Directives**: Focus exclusively on writing raw feature implementations quickly based on the prompt instructions. Do not optimize architecture or spend tokens on stylistic finesse—the `Modularizer` and `Stylist` profiles will review, refactor, and polish your output before a PR is opened.