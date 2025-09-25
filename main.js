const { Plugin, TFile, Setting, PluginSettingTab } = require('obsidian');

module.exports = class WeakLinkPlugin extends Plugin {
  async onload() {
    console.log('WeakLinkPlugin loaded');

    this.settings = Object.assign({ weakLinkColor: '#37aae2' }, await this.loadData());

    const openFileInNewSameGroupTab = async (file) => {
      if (!(file instanceof TFile)) return;
      const newLeaf = this.app.workspace.getLeaf(true);
      await newLeaf.openFile(file);
      this.app.workspace.setActiveLeaf(newLeaf);
    };

    const processLinksInElement = (root) => {
      if (!root) return;
      root.querySelectorAll('a[href$=".md"]').forEach((link) => {
        if (link._weakLinkProcessed) return;
        link._weakLinkProcessed = true;

        const href = link.getAttribute('href');
        if (!href) return;

        const base = this.app.workspace.getActiveFile()?.path || '';
        const folderPath = base.substring(0, base.lastIndexOf('/') + 1);
        const fullPath = folderPath + href;
        const file = this.app.vault.getAbstractFileByPath(fullPath);

        if (!(file instanceof TFile)) {
          link.style.color = '#999';
          link.style.fontStyle = 'italic';
          link.title = 'File does not exist';
        } else {
          link.style.color = this.settings.weakLinkColor;
          link.style.fontStyle = 'italic';
          if (!link.style.cursor) link.style.cursor = 'pointer';
        }

        link.addEventListener('click', async (evt) => {
          if (evt.button !== 0) return;
          evt.preventDefault();
          await this.app.workspace.activeLeaf.openFile(file);
        });

        link.addEventListener('auxclick', async (evt) => {
          if (evt.button !== 1) return;
          evt.preventDefault();
          await openFileInNewSameGroupTab(file);
        });
      });
    };

    const attachObserverForLeaf = (leaf) => {
      if (!leaf?.view?.containerEl) return;
      const root = leaf.view.containerEl;
      if (root._weakObserverAttached) return;
      root._weakObserverAttached = true;

      processLinksInElement(root);

      const observer = new MutationObserver((mutations) => {
        mutations.forEach((m) => {
          m.addedNodes.forEach((n) => {
            if (n instanceof HTMLElement) {
              n.querySelectorAll('a[href$=".md"]').forEach((link) => processLinksInElement(link.parentElement));
            }
          });
        });
      });

      observer.observe(root, { childList: true, subtree: true });
      root._weakObserver = observer;
    };

    this.app.workspace.getLeavesOfType('markdown').forEach((l) => attachObserverForLeaf(l));

    this.registerEvent(this.app.workspace.on('active-leaf-change', () => {
      attachObserverForLeaf(this.app.workspace.activeLeaf);
    }));

    this.app.workspace.onLayoutReady(() => {
      this.app.workspace.getLeavesOfType('markdown').forEach((l) => attachObserverForLeaf(l));
    });

    this.addSettingTab(new class extends PluginSettingTab {
      constructor(plugin) {
        super(app, plugin);
        this.plugin = plugin;
      }

      display() {
        const { containerEl } = this;

        containerEl.empty();

        containerEl.createEl('h2', { text: 'Weak Link Plugin Settings' });

        new Setting(containerEl)
          .setName('Weak Link Color')
          .setDesc('Hex code for the color of weak links')
          .addText(text => text
            .setPlaceholder('#2db3eb')
            .setValue(this.plugin.settings.weakLinkColor)
            .onChange(async (value) => {
              if (!/^#([0-9A-F]{3}){1,2}$/i.test(value)) return;
              this.plugin.settings.weakLinkColor = value;
              await this.plugin.saveData(this.plugin.settings);

              // Update existing weak links
              this.plugin.app.workspace.getLeavesOfType('markdown').forEach((leaf) => {
                const root = leaf?.view?.containerEl;
                if (!root) return;
                root.querySelectorAll('a[href$=".md"]').forEach(link => {
                  const file = this.plugin.app.vault.getAbstractFileByPath(link.getAttribute('href'));
                  if (file instanceof TFile) link.style.color = value;
                });
              });
            }));
      }
    }(this));
  }

  async onunload() {
    this.app.workspace.getLeavesOfType('markdown').forEach((leaf) => {
      const root = leaf?.view?.containerEl;
      if (root?._weakObserver) {
        root._weakObserver.disconnect();
        root._weakObserver = null;
      }
    });
    console.log('WeakLinkPlugin unloaded');
  }
};

