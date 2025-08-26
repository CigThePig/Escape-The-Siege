export const GRID_W=90,GRID_H=30,VIEW_W=30;export const PASSIVE_MANA=1,START_MANA=10,START_HP=15;
export const CHEST_MANA=8;export const COSTS={arrow:9,rune:10,fire:16,spike:3};
export const POTION_HEAL=5;
export const TRAP_RANGE=10,TRAP_DMG=2;export const RUNE_RADIUS=15,FIRE_DMG=3,FIRE_RADIUS=3,SAB_EXP_DMG=3,SAB_EXP_RADIUS=3,SPIKE_DMG=8;export const PLACE_RADIUS=4,PLACE_ZOOM=1.4;
export const ARROW_AMMO=5,FIRE_AMMO=10,RUNE_TURNS=20;export const BURN_TURNS=2,BURN_DMG=1;export const RUNE_SLOW_TURNS=2;
export const DASH_CD=8,DASH_COST=3;
export const DENSITY_TILE_WEIGHT=.5,DENSITY_NEIGHBOR_WEIGHT=.25,PATIENCE_PROB=.2,PATROL_RADIUS=12;
export const ENEMY={
    goblin:{hp:3,touch:2,reward:1,speed:1},
    archer:{hp:4,touch:1,reward:2,speed:1,range:4,cd:3,dmg:2},
    wraith:{hp:6,touch:3,reward:4,speed:1,phaser:true},
    brute:{hp:20,touch:10,reward:10,speed:1,boss:true},
    saboteur:{hp:1,touch:0,reward:8,speed:1,boss:true},
    hunter:{hp:3,touch:2,reward:6,speed:2,boss:true}
};
export function baseSpawnCooldown(t){return Math.max(2,4-Math.floor(t/20))}
export function baseSpawnCount(t){return 1+Math.floor(t/15)}
export const ENEMY_CAP=18,CHESTS_PER_RUN=5,SPAWN_MIN_RADIUS=6;
export const NODE_SIZE=6,NODE_BUFFER=2,NODE_CAPTURE_TURNS=60,NODE_ENEMY_CAP_INCR=10;
export const COLORS={wall:'#0a0e1a',wallEdge:'#3b486b',floor:'#263667',start:'#1a6e2d',exit:'#22c55e',spawner:'#8b5cf6',arrow:'#0ea5e9',rune:'#06b6d4',fire:'#ef4444',spike:'#b45309',chest:'#eab308',player:'#fbbf24',enemyGoblin:'#ef4444',enemyArcher:'#f59e0b',enemyWraith:'#a78bfa',enemyBrute:'#991b1b',enemySaboteur:'#f97316',enemyHunter:'#10b981',saboteurExplosion:'#a855f7',mana:'#7dd3fc',potion:'#f87171',explosion:'#fbbf24',nodeIdle:'#1e3a8a',nodeCapturing:'#60a5fa',nodeCaptured:'#22c55e'};
