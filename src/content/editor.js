/**
 * Draft.js 编辑器读写。
 *
 * 核心难点：X 的发帖框是 React 控制的 contenteditable（Draft.js）。
 * 直接 `el.innerHTML = x` 或 `el.textContent = x` **不会**更新 React state，
 * 表现是「文字显示出来了，但字符计数不动、发帖按钮灰色」。
 *
 * 正确做法：用原生 setter 绕过 React 的 value 劫持写入，再派发 input 事件。
 */
(function (root) {
  'use strict';

  const XAI = (root.XAI = root.XAI || {});
  const U = XAI.utils;
  const E = (XAI.editor = {});

  /** 读取编辑器当前纯文本 */
  E.getText = function getText(editor) {
    if (!editor) return '';
    return U.cleanText(editor.innerText);
  };

  /** 清空编辑器内容 */
  E.clear = function clear(editor) {
    if (!editor) return;
    try {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editor);
      sel.removeAllRanges();
      sel.addRange(range);
      // execCommand('delete') 会走浏览器原生编辑路径，Draft 能正确收到
      if (!document.execCommand('delete')) throw new Error('execCommand failed');
    } catch (e) {
      // 退路：手动清空 + 通知
      E._writeNative(editor, '');
      E._dispatchInput(editor, '');
    }
  };

  /**
   * 回填文本。
   * @param {HTMLElement} editor Draft contenteditable
   * @param {string} text
   * @returns {boolean} 是否成功写入
   */
  E.setText = function setText(editor, text) {
    if (!editor) return false;
    const value = String(text == null ? '' : text);

    editor.focus();

    // 1) 先清空（Draft 对 delete 敏感，execCommand 最稳）
    E.clear(editor);

    // 2) 写入
    E._writeNative(editor, value);

    // 3) 通知 React / Draft
    E._dispatchInput(editor, value);

    // 4) 光标置尾，方便用户继续编辑
    E._caretToEnd(editor);

    // 5) 校验：确认写入生效（X 的编辑器偶尔会吞掉超长/特殊字符）
    const back = E.getText(editor);
    if (back && back.slice(0, 6) !== value.slice(0, 6)) {
      // 重试一次（React 有时在同帧内会重渲染覆盖）
      E._writeNative(editor, value);
      E._dispatchInput(editor, value);
    }
    return true;
  };

  /** 原生 setter 写入（绕过 React 的劫持） */
  E._writeNative = function _writeNative(editor, value) {
    try {
      const desc = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, 'textContent');
      if (desc && desc.set) {
        desc.set.call(editor, value);
        return;
      }
    } catch (e) {
      /* fallthrough */
    }
    try {
      editor.innerHTML = value ? U.escapeHtml(value) : '';
    } catch (e) {
      editor.textContent = value;
    }
  };

  /** 派发 Draft.js 能识别的事件序列 */
  E._dispatchInput = function _dispatchInput(editor, value) {
    // 关键：input + 必须 bubbles，Draft 监听在编辑器本身
    try {
      editor.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          cancelable: false,
          inputType: 'insertText',
          data: value,
        })
      );
    } catch (e) {
      try {
        editor.dispatchEvent(new Event('input', { bubbles: true }));
      } catch (e2) {
        /* noop */
      }
    }
    // 部分版本还需要这两个
    try {
      editor.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e) {
      /* noop */
    }
  };

  E._caretToEnd = function _caretToEnd(editor) {
    try {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (e) {
      /* noop */
    }
  };

  /** 读取字符计数（若能读到） */
  E.getCounter = function getCounter(dialog) {
    if (!dialog) return null;
    const el = dialog.querySelector('[data-testid="tweet-textarea-counter"]');
    return el ? U.cleanText(el.innerText) : null;
  };

  /** 把文字插入到当前光标处而不覆盖（用于"追加"场景） */
  E.appendText = function appendText(editor, text) {
    const cur = E.getText(editor);
    if (!cur) return E.setText(editor, text);
    const sep = cur.endsWith('\n') ? '' : ' ';
    return E.setText(editor, cur + sep + text);
  };
})(typeof window !== 'undefined' ? window : self);
