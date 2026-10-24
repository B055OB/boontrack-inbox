/**
 * OnlineBoost — Previous-Class Experience Carousel & Lightbox
 * Accessible, Responsive, Zero-Dependency Vanilla JS
 */

(function () {
  'use strict';

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initExperienceCarousel);
  } else {
    initExperienceCarousel();
  }

  function initExperienceCarousel() {
    const track = document.getElementById('exp-carousel-track');
    const viewport = document.getElementById('exp-carousel-viewport');
    const prevBtn = document.getElementById('exp-carousel-prev');
    const nextBtn = document.getElementById('exp-carousel-next');
    const counter = document.getElementById('exp-carousel-counter');
    const dotsWrap = document.getElementById('exp-carousel-dots');

    if (!track || !viewport || !prevBtn || !nextBtn) return;
    if (track.hasAttribute('data-carousel-initialized')) return;
    track.setAttribute('data-carousel-initialized', 'true');

    const cards = Array.from(track.querySelectorAll('.experience-card'));
    const totalCards = cards.length;
    if (totalCards === 0) return;

    let currentIndex = 0;
    let cardsPerView = getCardsPerView();

    function getCardsPerView() {
      const w = window.innerWidth;
      if (w >= 1024) return 3;
      if (w >= 640) return 2;
      return 1;
    }

    // Build indicator dots
    if (dotsWrap) {
      dotsWrap.innerHTML = '';
      cards.forEach((_, idx) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'carousel-dot' + (idx === 0 ? ' active' : '');
        dot.setAttribute('aria-label', `Pindah ke slide ${idx + 1}`);
        dot.addEventListener('click', () => {
          goToIndex(idx);
          updateAccessibilityFocus(idx);
        });
        dotsWrap.appendChild(dot);
      });
    }

    function updateCarousel() {
      cardsPerView = getCardsPerView();
      const maxIndex = Math.max(0, totalCards - cardsPerView);
      if (currentIndex > maxIndex) {
        currentIndex = maxIndex;
      }

      // Calculate translation taking into account flexbox gap
      const firstCard = cards[0];
      if (firstCard) {
        let step = 0;
        if (cards[1]) {
          step = cards[1].offsetLeft - firstCard.offsetLeft;
        }
        if (step <= 0) {
          const trackStyle = window.getComputedStyle(track);
          const gap = parseFloat(trackStyle.gap) || 20;
          const cardWidth = firstCard.getBoundingClientRect().width;
          step = cardWidth + gap;
        }
        const offset = currentIndex * step;
        track.style.transform = `translateX(-${offset}px)`;
      }

      // Update counter
      if (counter) {
        counter.textContent = `${currentIndex + 1} / ${totalCards}`;
      }

      // Update dots
      if (dotsWrap) {
        const dots = dotsWrap.querySelectorAll('.carousel-dot');
        dots.forEach((dot, idx) => {
          if (idx === currentIndex) {
            dot.classList.add('active');
            dot.setAttribute('aria-current', 'true');
          } else {
            dot.classList.remove('active');
            dot.removeAttribute('aria-current');
          }
        });
      }

      // Update button states
      prevBtn.disabled = currentIndex === 0;
      prevBtn.classList.toggle('disabled', currentIndex === 0);
      nextBtn.disabled = currentIndex >= maxIndex;
      nextBtn.classList.toggle('disabled', currentIndex >= maxIndex);
    }

    function goToIndex(idx) {
      const maxIndex = Math.max(0, totalCards - getCardsPerView());
      currentIndex = Math.max(0, Math.min(idx, maxIndex));
      updateCarousel();
    }

    function nextSlide() {
      const maxIndex = Math.max(0, totalCards - getCardsPerView());
      if (currentIndex < maxIndex) {
        currentIndex++;
        updateCarousel();
      }
    }

    function prevSlide() {
      if (currentIndex > 0) {
        currentIndex--;
        updateCarousel();
      }
    }

    function updateAccessibilityFocus(idx) {
      const targetCard = cards[idx];
      if (targetCard) {
        const btn = targetCard.querySelector('.experience-thumb-btn');
        if (btn) btn.focus();
      }
    }

    // Button event listeners
    prevBtn.addEventListener('click', prevSlide);
    nextBtn.addEventListener('click', nextSlide);

    // Keyboard navigation on viewport
    viewport.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevSlide();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        nextSlide();
      }
    });

    // Touch swipe support on mobile
    let touchStartX = 0;
    let touchEndX = 0;
    let isSwiping = false;

    viewport.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
      isSwiping = true;
    }, { passive: true });

    viewport.addEventListener('touchend', (e) => {
      if (!isSwiping) return;
      isSwiping = false;
      touchEndX = e.changedTouches[0].screenX;
      handleSwipe();
    }, { passive: true });

    function handleSwipe() {
      const threshold = 45;
      const diff = touchStartX - touchEndX;
      if (Math.abs(diff) > threshold) {
        if (diff > 0) {
          nextSlide();
        } else {
          prevSlide();
        }
      }
    }

    // Responsive recalculation on resize
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        updateCarousel();
      }, 100);
    });

    // Initial positioning
    updateCarousel();

    // =========================================================================
    // LIGHTBOX IMPLEMENTATION
    // =========================================================================
    const lightboxDialog = document.getElementById('exp-lightbox');
    const lightboxBackdrop = document.getElementById('exp-lightbox-backdrop');
    const lightboxImg = document.getElementById('exp-lightbox-img');
    const lightboxCaption = document.getElementById('exp-lightbox-caption');
    const lightboxClose = document.getElementById('exp-lightbox-close');

    let lastFocusedElement = null;

    const thumbBtns = document.querySelectorAll('.experience-thumb-btn');
    thumbBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const src = btn.getAttribute('data-lightbox-src');
        const caption = btn.getAttribute('data-lightbox-caption') || '';
        openLightbox(src, caption, btn);
      });
    });

    function openLightbox(src, caption, triggerEl) {
      if (!lightboxDialog || !lightboxImg) return;
      lastFocusedElement = triggerEl || document.activeElement;

      lightboxImg.src = src;
      lightboxImg.alt = caption;
      if (lightboxCaption) {
        lightboxCaption.textContent = caption;
      }

      lightboxDialog.classList.add('active');
      if (lightboxBackdrop) lightboxBackdrop.classList.add('active');
      document.body.classList.add('lightbox-open');

      if (lightboxClose) {
        lightboxClose.focus();
      }

      document.addEventListener('keydown', handleLightboxKeydown);
    }

    function closeLightbox() {
      if (!lightboxDialog) return;
      lightboxDialog.classList.remove('active');
      if (lightboxBackdrop) lightboxBackdrop.classList.remove('active');
      document.body.classList.remove('lightbox-open');

      document.removeEventListener('keydown', handleLightboxKeydown);

      if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
        lastFocusedElement.focus();
      }
    }

    function handleLightboxKeydown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeLightbox();
      }
    }

    if (lightboxClose) {
      lightboxClose.addEventListener('click', closeLightbox);
    }

    if (lightboxBackdrop) {
      lightboxBackdrop.addEventListener('click', closeLightbox);
    }

    // Also close if clicking outside modal content
    if (lightboxDialog) {
      lightboxDialog.addEventListener('click', (e) => {
        if (e.target === lightboxDialog) {
          closeLightbox();
        }
      });
    }
  }
})();
