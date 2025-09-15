import { WalletManager } from './wallet-manager.js';
import inquirer from 'inquirer';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
    console.log('🚀 TON Wallet Manager Started');
    console.log('================================');
    
    const walletManager = new WalletManager();
    await walletManager.initialize();
    
    const { action } = await inquirer.prompt([
        {
            type: 'list',
            name: 'action',
            message: 'What would you like to do?',
            choices: [
                'Create Child Wallets',
                'View All Wallets', 
                'Check Master Wallet Balance',
                'Convert USDT to TON',
                'Distribute TON to Child Wallets',
                'Exit'
            ]
        }
    ]);

    switch (action) {
        case 'Create Child Wallets':
            await createChildWallets(walletManager);
            break;
        case 'View All Wallets':
            await viewAllWallets(walletManager);
            break;
        case 'Check Master Wallet Balance':
            await checkMasterBalance(walletManager);
            break;
        case 'Convert USDT to TON':
            await convertUsdtToTon(walletManager);
            break;
        case 'Distribute TON to Child Wallets':
            await distributeTonToChildren(walletManager);
            break;
        case 'Exit':
            console.log('👋 Goodbye!');
            process.exit(0);
    }
    
    // Restart the menu
    setTimeout(() => main(), 2000);
}

async function convertUsdtToTon(walletManager) {
    try {
        const tonPrice = await walletManager.getTonPrice();
        console.log(`\n💰 Current TON Price: ${tonPrice}`);
        
        const { usdtAmount } = await inquirer.prompt([
            {
                type: 'number',
                name: 'usdtAmount',
                message: 'How much USDT do you want to convert to TON?',
                validate: (input) => {
                    if (input > 0) {
                        return true;
                    }
                    return 'Please enter a positive number';
                }
            }
        ]);
        
        const tonAmount = (usdtAmount / tonPrice).toFixed(4);
        
        console.log(`\n🔄 Conversion Details:`);
        console.log(`USDT Amount: ${usdtAmount}`);
        console.log(`TON Price: ${tonPrice}`);
        console.log(`TON Amount: ${tonAmount} TON`);
        
        const { confirm } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirm',
                message: `Do you want to simulate adding ${tonAmount} TON to master wallet?`
            }
        ]);
        
        if (confirm) {
            await walletManager.simulateAddTonToMaster(parseFloat(tonAmount));
            console.log(`✅ Successfully simulated adding ${tonAmount} TON to master wallet!`);
        }
        
    } catch (error) {
        console.error('❌ Error converting USDT to TON:', error.message);
    }
}

async function distributeTonToChildren(walletManager) {
    try {
        const masterBalance = await walletManager.getMasterWalletBalance();
        const childWallets = await walletManager.getAllWallets();
        
        if (childWallets.children.length === 0) {
            console.log('❌ No child wallets found! Create some child wallets first.');
            return;
        }
        
        console.log(`\n💰 Master Wallet Balance: ${masterBalance} TON`);
        console.log(`👶 Child Wallets Count: ${childWallets.children.length}`);
        
        if (parseFloat(masterBalance) <= 0) {
            console.log('❌ Master wallet has no TON to distribute!');
            return;
        }
        
        const { amount } = await inquirer.prompt([
            {
                type: 'number',
                name: 'amount',
                message: 'How much TON do you want to distribute? (0 for all available)',
                validate: (input) => {
                    if (input >= 0 && input <= parseFloat(masterBalance)) {
                        return true;
                    }
                    return `Please enter a number between 0 and ${masterBalance}`;
                }
            }
        ]);
        
        const totalToDistribute = amount === 0 ? parseFloat(masterBalance) * 0.95 : amount;
        const amountPerWallet = (totalToDistribute / childWallets.children.length).toFixed(6);
        
        console.log(`\n📊 Distribution Details:`);
        console.log(`Total to Distribute: ${totalToDistribute} TON`);
        console.log(`Amount per Wallet: ${amountPerWallet} TON`);
        console.log(`Number of Recipients: ${childWallets.children.length}`);
        
        const { confirm } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirm',
                message: 'Do you want to proceed with the distribution?'
            }
        ]);
        
        if (confirm) {
            console.log('\n⏳ Starting TON distribution...');
            const result = await walletManager.distributeTonToChildren(totalToDistribute);
            
            if (result.success) {
                console.log(`✅ Successfully distributed TON to ${result.successCount} wallets!`);
                if (result.failedCount > 0) {
                    console.log(`⚠️ Failed to send to ${result.failedCount} wallets.`);
                }
            } else {
                console.error('❌ Distribution failed:', result.error);
            }
        }
        
    } catch (error) {
        console.error('❌ Error distributing TON:', error.message);
    }
}

async function createChildWallets(walletManager) {
    const { count } = await inquirer.prompt([
        {
            type: 'number',
            name: 'count',
            message: 'How many child wallets do you want to create?',
            validate: (input) => {
                if (input > 0 && input <= 1000) {
                    return true;
                }
                return 'Please enter a number between 1 and 1000';
            }
        }
    ]);
    
    console.log(`\n⏳ Creating ${count} child wallets...`);
    
    try {
        const wallets = await walletManager.createChildWallets(count);
        console.log(`✅ Successfully created ${wallets.length} child wallets!`);
        
        console.log('\n📋 Preview of created wallets (first 5):');
        wallets.slice(0, 5).forEach((wallet, index) => {
            console.log(`${index + 1}. Address: ${wallet.address}`);
            console.log(`   Mnemonic: ${wallet.mnemonic.join(' ')}`);
            console.log(`   Created: ${wallet.createdAt}`);
            console.log('');
        });
        
        if (wallets.length > 5) {
            console.log(`... and ${wallets.length - 5} more wallets`);
        }
    } catch (error) {
        console.error('❌ Error creating child wallets:', error.message);
    }
}

async function viewAllWallets(walletManager) {
    try {
        const allWallets = await walletManager.getAllWallets();
        
        console.log('\n📊 Wallet Summary:');
        console.log(`Master Wallet: ${allWallets.master ? 'Created' : 'Not Created'}`);
        console.log(`Child Wallets: ${allWallets.children.length}`);
        
        if (allWallets.master) {
            console.log('\n👑 Master Wallet:');
            console.log(`Address: ${allWallets.master.address}`);
            console.log(`Created: ${allWallets.master.createdAt}`);
        }
        
        if (allWallets.children.length > 0) {
            console.log('\n👶 Child Wallets:');
            allWallets.children.forEach((wallet, index) => {
                console.log(`${index + 1}. ${wallet.address} (${wallet.createdAt})`);
            });
        }
    } catch (error) {
        console.error('❌ Error retrieving wallets:', error.message);
    }
}

async function checkMasterBalance(walletManager) {
    try {
        const balance = await walletManager.getMasterWalletBalance();
        console.log(`\n💰 Master Wallet Balance: ${balance} TON`);
    } catch (error) {
        console.error('❌ Error checking balance:', error.message);
    }
}

// Start the application
main().catch(console.error);