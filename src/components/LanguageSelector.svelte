<script>
  import { locale } from 'svelte-i18n';
</script>

<div class="inline-flex items-center gap-1.5 p-1 bg-[#0f0f13]/80 backdrop-blur-md border border-white/5 rounded-full select-none shadow-lg transition-all duration-300">
  <button
    type="button"
    class="px-3.5 py-1 text-[10px] sm:text-xs font-semibold tracking-wider rounded-full transition-all duration-300 ease-out focus:outline-none cursor-pointer {$locale === 'en' ? 'bg-white/10 text-white shadow-md' : 'text-neutral-500 hover:text-neutral-300'}"
    on:click={() => locale.set('en')}
  >
    EN
  </button>
  <button
    type="button"
    class="px-3.5 py-1 text-[10px] sm:text-xs font-semibold tracking-wider rounded-full transition-all duration-300 ease-out focus:outline-none cursor-pointer {$locale === 'es' ? 'bg-white/10 text-white shadow-md' : 'text-neutral-500 hover:text-neutral-300'}"
    on:click={() => locale.set('es')}
  >
    ES
  </button>
</div>
