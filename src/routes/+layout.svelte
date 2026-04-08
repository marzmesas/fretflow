<script lang="ts">
  import "../app.css";
  import { page } from "$app/stores";

  const nav = [
    { href: "/", label: "Home" },
    { href: "/library", label: "Library" },
    { href: "/practice", label: "Practice" },
    { href: "/settings", label: "Settings" },
  ];
</script>

<div class="app-root">
  <header class="app-header">
    <a class="app-brand" href="/">Fretflow</a>
    <nav class="app-nav" aria-label="Main">
      {#each nav as item}
        <a
          href={item.href}
          aria-current={$page.url.pathname === item.href ? "page" : undefined}
        >
          {item.label}
        </a>
      {/each}
    </nav>
  </header>
  <main class="app-main" class:app-main--wide={$page.url.pathname.startsWith("/practice")}>
    <slot />
  </main>
</div>
