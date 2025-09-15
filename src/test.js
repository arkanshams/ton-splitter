import { WalletManager } from './wallet-manager.js';
import dotenv from 'dotenv';

dotenv.config();

async function testFullWorkflow() {
    console.log('🧪 Testing Full TON Wallet Manager Workflow...');
    
    const walletManager = new WalletManager();
    await walletManager.initialize();
    
    console.log('\n1️⃣ Creating 3 test child wallets...');
    await walletManager.createChildWallets(3);
    
    console.log('\n2️⃣ Getting TON price...');
    const tonPrice = await walletManager.getTonPrice();
    console.log(`💰 Current TON Price: ${tonPrice}`);
    
    console.log('\n3️⃣ Simulating USDT to TON conversion...');
    const usdtAmount = 100; // $100 USDT
    const tonAmount = usdtAmount / tonPrice;
    console.log(`🔄 Converting ${usdtAmount} USDT to ${tonAmount.toFixed(4)} TON`);
    
    await walletManager.simulateAddTonToMaster(tonAmount);
    
    console.log('\n4️⃣ Checking master wallet balance...');
    const masterBalance = await walletManager.getMasterWalletBalance();
    console.log(`👑 Master Wallet Balance: ${masterBalance} TON`);
    
    console.log('\n5️⃣ Distributing TON to child wallets...');
    const result = await walletManager.distributeTonToChildren(parseFloat(masterBalance) * 0.9);
    
    console.log('\n6️⃣ Distribution Results:');
    console.log(`✅ Successful transfers: ${result.successCount}`);
    console.log(`❌ Failed transfers: ${result.failedCount}`);
    
    console.log('\n7️⃣ Final wallet stats...');
    const stats = walletManager.getWalletStats();
    console.log('📊 Stats:', stats);
    
    const finalMasterBalance = await walletManager.getMasterWalletBalance();
    console.log(`👑 Final Master Balance: ${finalMasterBalance} TON`);
    
    console.log('\n✅ Full workflow test completed successfully!');
}

testFullWorkflow().catch(console.error);