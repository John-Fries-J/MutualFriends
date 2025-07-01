/**
 * @name MutualFriends
 * @author johnfries
 * @version 1.6.1
 * @description Adds a context menu item to show all friends in the current server when right-clicking the server icon
 * @website https://johnfries.net
 * @source https://github.com/John-Fries-J/MutualFriends
 */

var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

var MutualFriends_exports = {};
__export(MutualFriends_exports, {
  default: () => MutualFriends
});
module.exports = __toCommonJS(MutualFriends_exports);

var styles_default = `
    .mutual-friends-modal {
        background-color: var(--background-primary);
        padding: 20px;
        border-radius: 8px;
        max-width: 400px;
        max-height: 500px;
        overflow-y: auto;
    }
    .mutual-friends-title {
        color: #ffffff;
        font-size: 18px;
        font-weight: 600;
        margin-bottom: 15px;
    }
    .mutual-friends-list {
        list-style: none;
        padding: 0;
    }
    .mutual-friends-item {
        padding: 8px;
        margin: 4px 0;
        background-color: var(--background-secondary);
        border-radius: 4px;
        color: #ffffff;
    }
    .mutual-friends-modal::-webkit-scrollbar {
        width: 8px;
    }
    .mutual-friends-modal::-webkit-scrollbar-thumb {
        background-color: rgba(32,34,37,.6);
        border-radius: 4px;
        border: 2px solid transparent;
    }
    .mutual-friends-modal::-webkit-scrollbar-track {
        background-color: transparent;
        border: 2px solid transparent;
    }
    .theme-light .mutual-friends-modal {
        background-color: #fff;
    }
    .theme-light .mutual-friends-title {
        color: #ffffff;
    }
    .theme-light .mutual-friends-item {
        color: #ffffff;
        background-color: rgba(255, 255, 255, 0.1);
    }
`;

class MutualFriends {
    constructor() {
        this.friends = [];
        this.serverMembers = [];
        this.contextMenuPatches = [];
    }

    start() {
        BdApi.Logger.info('MutualFriends', 'Starting plugin version 1.6.0');
        BdApi.DOM.addStyle('MutualFriends', styles_default);
        this.patchContextMenu();
    }

    stop() {
        BdApi.Logger.info('MutualFriends', 'Stopping plugin');
        BdApi.DOM.removeStyle('MutualFriends');
        for (const cancel of this.contextMenuPatches) cancel();
    }

    patchContextMenu() {
        const ContextMenu = BdApi.ContextMenu;
        this.contextMenuPatches.push(ContextMenu.patch('guild-context', (retVal, props) => {
            if (!props?.guild) return retVal;

            const guildId = props.guild.id;
            const newItem = ContextMenu.buildItem({
                label: 'Show Mutual Friends',
                action: () => this.showFriendsModal(guildId)
            });

            const children = retVal?.props?.children;
            if (Array.isArray(children)) {
                children.splice(1, 0, newItem);
            } else if (children?.props?.children) {
                children.props.children.splice(1, 0, newItem);
            }
        }));
    }

    async showFriendsModal(guildId) {
        try {
            if (!guildId) {
                BdApi.UI.showToast('No server selected!', { type: 'error' });
                return;
            }

            await this.fetchFriendsAndMembers(guildId);

            const mutualFriends = this.friends.filter(friend => 
                this.serverMembers.some(member => member.userId === friend.id)
            );

            const modalContent = `
                <div class="mutual-friends-modal">
                    <div class="mutual-friends-title">Friends in this Server (${mutualFriends.length})</div>
                    <ul class="mutual-friends-list">
                        ${mutualFriends.length > 0 
                            ? mutualFriends.map(friend => `<li class="mutual-friends-item">${friend.username}</li>`).join('')
                            : '<li class="mutual-friends-item">No friends found in this server.</li>'
                        }
                    </ul>
                </div>
            `;

            BdApi.UI.showConfirmationModal(
                'Mutual Friends',
                BdApi.React.createElement('div', { dangerouslySetInnerHTML: { __html: modalContent } }),
                { confirmText: 'Complete' }
            );
        } catch (error) {
            console.error('[MutualFriends] Error in showFriendsModal:', error);
            BdApi.UI.showToast('Failed to load friends list. Check console for details.', { type: 'error' });
        }
    }

    async fetchFriendsAndMembers(guildId) {
        try {
            const RelationshipModule = BdApi.Webpack.getByKeys('getRelationships', 'getFriendIDs') ||
                                      BdApi.Webpack.getModule(m => m.getFriendIDs || m.getRelationship, { searchExports: true });
            console.log('[MutualFriends] RelationshipModule found:', !!RelationshipModule);
            if (!RelationshipModule || (!RelationshipModule.getRelationships && !RelationshipModule.getFriendIDs)) {
                throw new Error('Could not find relationship module or required functions');
            }
            let relationships = {};
            if (RelationshipModule.getRelationships) {
                relationships = RelationshipModule.getRelationships();
            } else if (RelationshipModule.getFriendIDs) {
                const friendIds = RelationshipModule.getFriendIDs();
                const UserStore = BdApi.Webpack.getByKeys('getUser');
                friendIds.forEach(id => {
                    const user = UserStore?.getUser(id);
                    if (user) relationships[id] = { id, type: 1, username: user.username };
                });
            }
            console.log('[MutualFriends] Relationships count:', Object.keys(relationships).length);
            this.friends = Object.values(relationships)
                .filter(rel => rel.type === 1)
                .map(rel => ({ id: rel.id, username: rel.username || 'Unknown User' }));

            const GuildMemberModule = BdApi.Webpack.getByKeys('getMemberIds', 'getMembers') ||
                                     BdApi.Webpack.getModule(m => m.getMemberIds || m.getMembers, { searchExports: true });
            console.log('[MutualFriends] GuildMemberModule found:', !!GuildMemberModule);
            if (!GuildMemberModule || !GuildMemberModule.getMemberIds) {
                throw new Error('Could not find guild member module or getMemberIds function');
            }
            const memberIds = GuildMemberModule.getMemberIds(guildId);
            console.log('[MutualFriends] Member IDs count:', memberIds.length);
            this.serverMembers = memberIds.map(id => ({ userId: id }));
        } catch (error) {
            console.error('[MutualFriends] Error in fetchFriendsAndMembers:', error);
            throw error;
        }
    }
}