/** Pause the promotional rail while users interact with it. */
(() => {
    const initialize = () => {
        document.querySelectorAll(".jw-home .home-hero-slider").forEach((slider) => {
            if (slider.dataset.jawharatReady === "1") return;
            slider.dataset.jawharatReady = "1";
            const track = slider.querySelector(".home-hero-slider-track");
            if (!track) return;
            const pause = () => { track.style.animationPlayState = "paused"; };
            const resume = () => { track.style.animationPlayState = ""; };
            slider.addEventListener("pointerenter", pause);
            slider.addEventListener("pointerleave", resume);
            slider.addEventListener("focusin", pause);
            slider.addEventListener("focusout", resume);
        });
    };
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else {
        initialize();
    }
})();
