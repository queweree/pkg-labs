(() => {
  'use strict';

  const canvas = document.getElementById('rasterCanvas');
  const context = canvas.getContext('2d');
  const message = document.getElementById('message');
  const drawButton = document.getElementById('drawButton');

  function drawPlaceholder() {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#fffdf8';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#6e7369';
    context.font = '16px system-ui, sans-serif';
    context.fillText('Рабочая область подготовлена', 24, 34);
  }

  drawButton.addEventListener('click', () => {
    message.textContent = 'Интерфейс готов к подключению алгоритмов растеризации.';
    drawPlaceholder();
  });

  drawPlaceholder();
})();
