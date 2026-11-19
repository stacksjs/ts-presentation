const status = document.querySelector<HTMLOutputElement>('#example-slide-status')
window.addEventListener('presentation:slide', (event) => {
  if (status && event instanceof CustomEvent) status.value = String(event.detail.slide)
})
